/*
 * engine.c — Real FFT + 4-band envelope + spectral flux beat detection (Task 3)
 *
 * Beat detection: spectral flux vs. adaptive rolling-mean threshold.
 * Per-band onset: same principle per frequency band, with independent cooldowns.
 * Tempo BPM: rolling average of inter-beat intervals, clamped to 60–240 BPM.
 */
#include "engine.h"
#define _USE_MATH_DEFINES
#include <math.h>
#include <string.h>
#include <stdlib.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define MAX_FFT_SIZE 4096
#define RING_CAP     (MAX_FFT_SIZE * 4)

/* ---- global state ---- */
static int   g_sample_rate      = 44100;
static int   g_fft_size         = 2048;
static int   g_hop_size         = 512;
static float g_time             = 0.0f;
static int   g_samples_since_fft = 0;

/* ring buffer for incoming PCM */
static float g_ring[RING_CAP];
static int   g_ring_write = 0;
static int   g_ring_count = 0;

/* FFT workspace */
static float g_fft_re[MAX_FFT_SIZE];
static float g_fft_im[MAX_FFT_SIZE];
static float g_window[MAX_FFT_SIZE];
static float g_magnitude[MAX_FFT_SIZE/2];

/* per-band envelope follower */
typedef struct { float attack; float release; float value; } Envelope;
static Envelope g_env[4]; /* 0=sub, 1=bass, 2=mid, 3=high */

/* beat / tempo state */
static float g_beat_pulse  = 0.0f;
static float g_tempo_bpm   = 120.0f;
static float g_last_beat_t = 0.0f;
static int   g_beat_fired  = 0; /* set after first beat so startup time isn't counted as interval */

/* latest output frame */
static AudioFrame g_frame;

/* ---- spectral flux beat detector ---- */
#define FLUX_HIST_LEN       43    /* ~1 s at hop=512, sr=44100 */
#define BAND_HIST_LEN       20
#define BEAT_MIN_INTERVAL   0.22f /* max ~272 BPM */
#define ONSET_MIN_INTERVAL  0.08f /* max ~12 onsets/s per band */
#define FLUX_THRESH_MULT    1.5f  /* threshold = rolling_mean * this + epsilon */
#define TEMPO_HIST_LEN      8

static float g_prev_magnitude[MAX_FFT_SIZE/2];

static float g_flux_hist[FLUX_HIST_LEN];
static int   g_flux_head;
static float g_flux_sum;

static float g_band_flux_hist[4][BAND_HIST_LEN];
static int   g_band_flux_head[4];
static float g_band_flux_sum[4];
static float g_onset_cooldown[4]; /* seconds until next onset allowed per band */

static float g_beat_intervals[TEMPO_HIST_LEN];
static int   g_beat_int_head;
static int   g_beat_int_count;

/* ---- Cooley-Tukey radix-2 FFT ---- */
static void fft_inplace(float *re, float *im, int n) {
    for (int i = 1, j = 0; i < n; i++) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            float t;
            t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }
    for (int len = 2; len <= n; len <<= 1) {
        float ang = -2.0f * (float)M_PI / (float)len;
        float wRe = cosf(ang), wIm = sinf(ang);
        for (int i = 0; i < n; i += len) {
            float curRe = 1.0f, curIm = 0.0f;
            int half = len >> 1;
            for (int j = 0; j < half; j++) {
                float uRe = re[i + j],        uIm = im[i + j];
                float vRe = re[i+j+half]*curRe - im[i+j+half]*curIm;
                float vIm = re[i+j+half]*curIm + im[i+j+half]*curRe;
                re[i+j]      = uRe + vRe;  im[i+j]      = uIm + vIm;
                re[i+j+half] = uRe - vRe;  im[i+j+half] = uIm - vIm;
                float t = curRe*wRe - curIm*wIm;
                curIm   = curRe*wIm + curIm*wRe;
                curRe   = t;
            }
        }
    }
}

static void build_hann_window(int n) {
    for (int i = 0; i < n; i++)
        g_window[i] = 0.5f * (1.0f - cosf(2.0f*(float)M_PI*(float)i/(float)(n-1)));
}

static void run_fft(void) {
    int n    = g_fft_size;
    int half = n >> 1;
    int start = (g_ring_write - n + RING_CAP) % RING_CAP;
    for (int i = 0; i < n; i++) {
        g_fft_re[i] = g_ring[(start + i) % RING_CAP] * g_window[i];
        g_fft_im[i] = 0.0f;
    }
    fft_inplace(g_fft_re, g_fft_im, n);
    float scale = 2.0f / (float)n;
    for (int i = 0; i < half; i++) {
        float re = g_fft_re[i] * scale;
        float im = g_fft_im[i] * scale;
        g_magnitude[i] = sqrtf(re*re + im*im);
    }
}

static float band_rms(float f_lo, float f_hi) {
    int   half   = g_fft_size >> 1;
    float bin_hz = (float)g_sample_rate / (float)g_fft_size;
    int   b0 = (int)(f_lo / bin_hz);
    int   b1 = (int)(f_hi / bin_hz) + 1;
    if (b0 < 1)    b0 = 1;
    if (b1 > half) b1 = half;
    if (b1 <= b0)  return 0.0f;
    float sum = 0.0f;
    int   cnt = b1 - b0;
    for (int i = b0; i < b1; i++) sum += g_magnitude[i] * g_magnitude[i];
    float rms = sqrtf(sum / (float)cnt);
    float v = rms * 4.0f;
    return v > 1.0f ? 1.0f : v;
}

/* sum of positive spectral differences in [b0, b1) against previous frame */
static float flux_range(int b0, int b1) {
    float flux = 0.0f;
    for (int i = b0; i < b1; i++) {
        float diff = g_magnitude[i] - g_prev_magnitude[i];
        if (diff > 0.0f) flux += diff;
    }
    return flux;
}

/* bin bounds for a Hz range (same clipping rules as band_rms) */
static void band_bins(float f_lo, float f_hi, int *b0, int *b1) {
    int   half   = g_fft_size >> 1;
    float bin_hz = (float)g_sample_rate / (float)g_fft_size;
    *b0 = (int)(f_lo / bin_hz);
    *b1 = (int)(f_hi / bin_hz) + 1;
    if (*b0 < 1)    *b0 = 1;
    if (*b1 > half) *b1 = half;
}

/* ---- per-band envelope follower ---- */
static float envelope_follow(Envelope *e, float input, float dt) {
    float tc = (input > e->value) ? e->attack : e->release;
    float k  = (tc <= 0.0f) ? 1.0f : (1.0f - expf(-dt / tc));
    e->value += k * (input - e->value);
    return e->value;
}

/* ---- public API ---- */

void engine_init(int sample_rate, int fft_size) {
    g_sample_rate = (sample_rate > 0) ? sample_rate : 44100;
    if (fft_size > 0 && fft_size <= MAX_FFT_SIZE)
        g_fft_size = fft_size;
    else
        g_fft_size = 2048;
    g_hop_size          = g_fft_size / 4;
    g_time              = 0.0f;
    g_ring_write        = 0;
    g_ring_count        = 0;
    g_samples_since_fft = 0;
    memset(g_ring,      0, sizeof g_ring);
    memset(g_magnitude, 0, sizeof g_magnitude);
    memset(&g_frame,    0, sizeof g_frame);
    build_hann_window(g_fft_size);
    for (int i = 0; i < 4; i++) {
        g_env[i].attack  = 0.010f;
        g_env[i].release = 0.100f;
        g_env[i].value   = 0.0f;
    }
    g_beat_pulse   = 0.0f;
    g_tempo_bpm    = 120.0f;
    g_last_beat_t  = 0.0f;
    g_beat_fired   = 0;

    memset(g_prev_magnitude, 0, sizeof g_prev_magnitude);
    memset(g_flux_hist,      0, sizeof g_flux_hist);
    g_flux_head      = 0;
    g_flux_sum       = 0.0f;
    memset(g_band_flux_hist, 0, sizeof g_band_flux_hist);
    memset(g_band_flux_head, 0, sizeof g_band_flux_head);
    memset(g_band_flux_sum,  0, sizeof g_band_flux_sum);
    memset(g_onset_cooldown, 0, sizeof g_onset_cooldown);
    memset(g_beat_intervals, 0, sizeof g_beat_intervals);
    g_beat_int_head  = 0;
    g_beat_int_count = 0;
}

void engine_reset(void) {
    engine_init(g_sample_rate, g_fft_size);
}

void engine_set_envelope(int band, float attack, float release) {
    if (band < 0 || band >= 4) return;
    g_env[band].attack  = (attack  > 0.0f) ? attack  : 0.001f;
    g_env[band].release = (release > 0.0f) ? release : 0.001f;
}

void engine_push_samples(const float *buf, int n) {
    if (!buf || n <= 0) return;

    for (int i = 0; i < n; i++) {
        g_ring[g_ring_write] = buf[i];
        g_ring_write = (g_ring_write + 1) % RING_CAP;
        if (g_ring_count < RING_CAP) g_ring_count++;
    }

    g_time += (float)n / (float)g_sample_rate;
    float dt = (float)n / (float)g_sample_rate;

    g_samples_since_fft += n;
    if (g_samples_since_fft < g_hop_size || g_ring_count < g_fft_size)
        return;

    g_samples_since_fft = 0;
    run_fft();

    /* 4-band RMS → envelope followers */
    float sub_raw  = band_rms(   20.0f,    80.0f);
    float bass_raw = band_rms(   80.0f,   250.0f);
    float mid_raw  = band_rms(  250.0f,  4000.0f);
    float high_raw = band_rms( 4000.0f, 16000.0f);

    float sub  = envelope_follow(&g_env[0], sub_raw,  dt);
    float bass = envelope_follow(&g_env[1], bass_raw, dt);
    float mid  = envelope_follow(&g_env[2], mid_raw,  dt);
    float high = envelope_follow(&g_env[3], high_raw, dt);
    float energy = (sub + bass + mid + high) * 0.25f;

    /* ---- spectral flux beat detection ---- */
    static const float band_lo[4] = {   20.0f,   80.0f,  250.0f, 4000.0f };
    static const float band_hi[4] = {   80.0f,  250.0f, 4000.0f,16000.0f };

    /* global flux: focus on sub+bass+mid (0–8000 Hz) — kick-centric */
    int   half_bins = g_fft_size >> 1;
    float bin_hz    = (float)g_sample_rate / (float)g_fft_size;
    int   flux_b1   = (int)(8000.0f / bin_hz) + 1;
    if (flux_b1 > half_bins) flux_b1 = half_bins;
    float flux = flux_range(1, flux_b1);

    /* update rolling flux history */
    g_flux_sum -= g_flux_hist[g_flux_head];
    g_flux_hist[g_flux_head] = flux;
    g_flux_sum += flux;
    g_flux_head = (g_flux_head + 1) % FLUX_HIST_LEN;

    float flux_mean   = g_flux_sum / (float)FLUX_HIST_LEN;
    float flux_thresh = flux_mean * FLUX_THRESH_MULT + 0.005f;

    /* per-band flux (normalised by bin count so bands are comparable) */
    float band_flux[4];
    for (int b = 0; b < 4; b++) {
        int b0, b1;
        band_bins(band_lo[b], band_hi[b], &b0, &b1);
        int bins = (b1 > b0) ? (b1 - b0) : 1;
        band_flux[b] = flux_range(b0, b1) / (float)bins;

        g_band_flux_sum[b] -= g_band_flux_hist[b][g_band_flux_head[b]];
        g_band_flux_hist[b][g_band_flux_head[b]] = band_flux[b];
        g_band_flux_sum[b] += band_flux[b];
        g_band_flux_head[b] = (g_band_flux_head[b] + 1) % BAND_HIST_LEN;
    }

    /* beat detection: flux peak above adaptive threshold + cooldown */
    float time_since_beat = g_time - g_last_beat_t;

    if (flux > flux_thresh && time_since_beat > BEAT_MIN_INTERVAL) {
        if (g_beat_fired) {
            /* record inter-beat interval for BPM estimate */
            float candidate_bpm = 60.0f / time_since_beat;
            if (candidate_bpm >= 60.0f && candidate_bpm <= 240.0f) {
                g_beat_intervals[g_beat_int_head] = time_since_beat;
                g_beat_int_head = (g_beat_int_head + 1) % TEMPO_HIST_LEN;
                if (g_beat_int_count < TEMPO_HIST_LEN) g_beat_int_count++;
                float sum_int = 0.0f;
                for (int i = 0; i < g_beat_int_count; i++) sum_int += g_beat_intervals[i];
                g_tempo_bpm = 60.0f / (sum_int / (float)g_beat_int_count);
            }
        }
        g_beat_pulse  = 1.0f;
        g_last_beat_t = g_time;
        g_beat_fired  = 1;
    } else {
        /* exponential decay ~0.1 s */
        g_beat_pulse *= expf(-dt / 0.1f);
        if (g_beat_pulse < 1e-4f) g_beat_pulse = 0.0f;
    }

    /* per-band onset detection with cooldown */
    for (int b = 0; b < 4; b++) {
        g_onset_cooldown[b] -= dt;
        if (g_onset_cooldown[b] < 0.0f) g_onset_cooldown[b] = 0.0f;

        float band_mean   = g_band_flux_sum[b] / (float)BAND_HIST_LEN;
        float band_thresh = band_mean * FLUX_THRESH_MULT + 0.001f;

        if (band_flux[b] > band_thresh && g_onset_cooldown[b] <= 0.0f) {
            g_frame.onset[b]     = 1.0f;
            g_onset_cooldown[b]  = ONSET_MIN_INTERVAL;
        } else {
            g_frame.onset[b] = 0.0f;
        }
    }

    /* save magnitudes for next frame's flux computation */
    memcpy(g_prev_magnitude, g_magnitude, half_bins * sizeof(float));

    g_frame.energy     = energy;
    g_frame.sub        = sub;
    g_frame.bass       = bass;
    g_frame.mid        = mid;
    g_frame.high       = high;
    g_frame.beat_pulse = g_beat_pulse;
    g_frame.tempo_bpm  = g_tempo_bpm;
}

void engine_get_frame(AudioFrame *out) {
    if (out) *out = g_frame;
}
