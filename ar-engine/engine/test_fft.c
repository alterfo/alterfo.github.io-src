/*
 * test_fft.c — native validation of engine.c FFT + band analysis (Task 2)
 *
 * Compile: cc -O2 -std=c11 -lm engine.c test_fft.c -o test_fft
 * Run:     ./test_fft
 */
#include "engine.h"
#include <stdio.h>
#include <math.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define SR       44100
#define FFT_SIZE 2048
#define CHUNK    512

/* spectral descriptors (non-static in engine.c) — read the current spectrum */
extern float spectral_centroid_norm(void);
extern float spectral_tonalness(void);

/* static to avoid large stack allocations */
static float g_buf[SR];
static float g_buf2[SR];

static void fill_sine(float *buf, int n, float freq, float amp, int sr) {
    for (int i = 0; i < n; i++)
        buf[i] += amp * sinf(2.0f * (float)M_PI * freq * (float)i / (float)sr);
}

/* push total samples from signal in CHUNK-sized pieces, handling last partial chunk */
static void push_n(const float *signal, int total) {
    for (int off = 0; off < total; off += CHUNK) {
        int n = (off + CHUNK <= total) ? CHUNK : (total - off);
        engine_push_samples(signal + off, n);
    }
}

/* reset engine, push signal, return latest frame */
static AudioFrame push_signal(const float *signal, int total) {
    engine_reset();
    push_n(signal, total);
    AudioFrame f;
    engine_get_frame(&f);
    return f;
}

/* ---- tests ---- */

static int test_silence(void) {
    memset(g_buf, 0, sizeof g_buf);
    AudioFrame f = push_signal(g_buf, SR);
    int ok = (f.energy < 0.01f && f.sub < 0.01f && f.bass < 0.01f
              && f.mid < 0.01f && f.high < 0.01f);
    printf("[%s] silence → all bands < 0.01  (energy=%.4f)\n",
           ok ? "PASS" : "FAIL", f.energy);
    return ok;
}

static int test_sub_sine(void) {
    /* 50 Hz sine → should dominate sub band */
    memset(g_buf, 0, sizeof g_buf);
    fill_sine(g_buf, SR, 50.0f, 0.8f, SR);
    AudioFrame f = push_signal(g_buf, SR);
    int ok = (f.sub > 0.05f && f.sub >= f.bass && f.sub >= f.mid && f.sub >= f.high);
    printf("[%s] 50 Hz sine  → sub=%.3f bass=%.3f mid=%.3f high=%.3f\n",
           ok ? "PASS" : "FAIL", f.sub, f.bass, f.mid, f.high);
    return ok;
}

static int test_bass_sine(void) {
    /* 150 Hz sine → should dominate bass band */
    memset(g_buf, 0, sizeof g_buf);
    fill_sine(g_buf, SR, 150.0f, 0.8f, SR);
    AudioFrame f = push_signal(g_buf, SR);
    int ok = (f.bass > 0.05f && f.bass >= f.sub && f.bass >= f.mid && f.bass >= f.high);
    printf("[%s] 150 Hz sine → sub=%.3f bass=%.3f mid=%.3f high=%.3f\n",
           ok ? "PASS" : "FAIL", f.sub, f.bass, f.mid, f.high);
    return ok;
}

static int test_mid_sine(void) {
    /* 1 kHz sine → should dominate mid band */
    memset(g_buf, 0, sizeof g_buf);
    fill_sine(g_buf, SR, 1000.0f, 0.8f, SR);
    AudioFrame f = push_signal(g_buf, SR);
    int ok = (f.mid > 0.05f && f.mid >= f.sub && f.mid >= f.bass && f.mid >= f.high);
    printf("[%s] 1kHz sine   → sub=%.3f bass=%.3f mid=%.3f high=%.3f\n",
           ok ? "PASS" : "FAIL", f.sub, f.bass, f.mid, f.high);
    return ok;
}

static int test_high_sine(void) {
    /* 8 kHz sine → should dominate high band */
    memset(g_buf, 0, sizeof g_buf);
    fill_sine(g_buf, SR, 8000.0f, 0.8f, SR);
    AudioFrame f = push_signal(g_buf, SR);
    int ok = (f.high > 0.05f && f.high >= f.sub && f.high >= f.bass && f.high >= f.mid);
    printf("[%s] 8kHz sine   → sub=%.3f bass=%.3f mid=%.3f high=%.3f\n",
           ok ? "PASS" : "FAIL", f.sub, f.bass, f.mid, f.high);
    return ok;
}

static int test_energy_range(void) {
    /* full-scale 1 kHz → energy 0..1 */
    memset(g_buf, 0, sizeof g_buf);
    fill_sine(g_buf, SR, 1000.0f, 1.0f, SR);
    AudioFrame f = push_signal(g_buf, SR);
    int ok = (f.energy >= 0.0f && f.energy <= 1.0f);
    printf("[%s] energy range (1kHz full-scale) → %.4f\n",
           ok ? "PASS" : "FAIL", f.energy);
    return ok;
}

static int test_envelope_attack(void) {
    /* push silence, then 1kHz tone; mid should rise after tone starts */
    engine_init(SR, FFT_SIZE);
    engine_set_envelope(2, 0.010f, 1.0f); /* fast attack, slow release */

    /* silence for 1 second */
    memset(g_buf, 0, sizeof g_buf);
    push_n(g_buf, SR);
    AudioFrame before;
    engine_get_frame(&before);

    /* 1kHz tone for 1 second */
    memset(g_buf2, 0, sizeof g_buf2);
    fill_sine(g_buf2, SR, 1000.0f, 0.8f, SR);
    push_n(g_buf2, SR);
    AudioFrame after;
    engine_get_frame(&after);

    int ok = (after.mid > before.mid) && (after.mid > 0.01f);
    printf("[%s] envelope attack: mid before=%.4f after=%.4f\n",
           ok ? "PASS" : "FAIL", before.mid, after.mid);
    return ok;
}

static int test_beat_pulse_decay(void) {
    /* push silence for 2s — spectral flux = 0, no beat fires, pulse stays 0 */
    engine_init(SR, FFT_SIZE);
    memset(g_buf, 0, sizeof g_buf);
    push_n(g_buf, SR);
    push_n(g_buf, SR);

    AudioFrame f;
    engine_get_frame(&f);
    int ok = (f.beat_pulse >= 0.0f && f.beat_pulse <= 1.0f);
    printf("[%s] beat_pulse in [0,1]: %.4f  bpm=%.1f\n",
           ok ? "PASS" : "FAIL", f.beat_pulse, f.tempo_bpm);
    return ok;
}

/* ---- helper: push n seconds of silence in CHUNK-sized pieces ---- */
static void push_silence_secs(float secs) {
    int total = (int)(secs * SR);
    static float zbuf[CHUNK];
    memset(zbuf, 0, sizeof zbuf);
    int off = 0;
    while (off < total) {
        int n = (total - off < CHUNK) ? (total - off) : CHUNK;
        engine_push_samples(zbuf, n);
        off += n;
    }
}

/* ---- helper: push n seconds of a sine tone in CHUNK-sized pieces ---- */
static void push_tone_secs(float freq, float amp, float secs) {
    int total = (int)(secs * SR);
    static float tbuf[CHUNK];
    int off = 0;
    while (off < total) {
        int n = (total - off < CHUNK) ? (total - off) : CHUNK;
        for (int i = 0; i < n; i++)
            tbuf[i] = amp * sinf(2.0f * (float)M_PI * freq * (float)(off + i) / (float)SR);
        engine_push_samples(tbuf, n);
        off += n;
    }
}

/* ---- Task 3 tests ---- */

static int test_beat_fires_on_burst(void) {
    /* 1 s silence builds zero-flux history (threshold = ~0.005), then a 1 kHz
       burst produces large spectral flux → beat_pulse must spike */
    engine_init(SR, FFT_SIZE);
    push_silence_secs(1.0f);
    push_tone_secs(1000.0f, 0.8f, 0.1f);
    AudioFrame f;
    engine_get_frame(&f);
    int ok = (f.beat_pulse > 0.1f);
    printf("[%s] beat fires on burst: beat_pulse=%.4f\n",
           ok ? "PASS" : "FAIL", f.beat_pulse);
    return ok;
}

/*
 * Push up to 200 ms of a tone chunk-by-chunk and return 1 if onset[band] fires
 * at any point.  onset is a 0/1 flag that resets each FFT hop, so we must read
 * g_frame after every push to catch the single hop where it fires.
 */
static int onset_fires_during_burst(float freq, float amp, int band) {
    static float tbuf[CHUNK];
    int total = (int)(0.2f * SR);
    int off   = 0;
    while (off < total) {
        int n = (total - off < CHUNK) ? (total - off) : CHUNK;
        for (int i = 0; i < n; i++)
            tbuf[i] = amp * sinf(2.0f * (float)M_PI * freq * (float)i / (float)SR);
        engine_push_samples(tbuf, n);
        AudioFrame f;
        engine_get_frame(&f);
        if (f.onset[band] > 0.5f) return 1;
        off += n;
    }
    return 0;
}

static int test_onset_fires_on_band_burst(void) {
    /* sub onset: silence → 50 Hz burst; check onset[0] on each hop */
    engine_init(SR, FFT_SIZE);
    push_silence_secs(1.0f);
    int ok0 = onset_fires_during_burst(50.0f, 0.8f, 0);
    printf("[%s] onset[0] fires on 50 Hz burst\n", ok0 ? "PASS" : "FAIL");

    /* bass onset */
    engine_init(SR, FFT_SIZE);
    push_silence_secs(1.0f);
    int ok1 = onset_fires_during_burst(150.0f, 0.8f, 1);
    printf("[%s] onset[1] fires on 150 Hz burst\n", ok1 ? "PASS" : "FAIL");

    /* high onset */
    engine_init(SR, FFT_SIZE);
    push_silence_secs(1.0f);
    int ok3 = onset_fires_during_burst(8000.0f, 0.8f, 3);
    printf("[%s] onset[3] fires on 8 kHz burst\n", ok3 ? "PASS" : "FAIL");

    return ok0 && ok1 && ok3;
}

static int test_onset_cooldown_prevents_double_fire(void) {
    /*
     * First burst triggers mid onset; silence < cooldown; second burst
     * arrives while cooldown is still active so onset must not re-fire.
     * After cooldown expires the tone is steady (flux ≈ 0), so still silent.
     */
    engine_init(SR, FFT_SIZE);
    push_silence_secs(1.0f);

    int fired_first  = onset_fires_during_burst(1000.0f, 0.8f, 2);
    push_silence_secs(0.02f); /* 20 ms — cooldown is 80 ms */
    int fired_second = onset_fires_during_burst(1000.0f, 0.8f, 2);

    int ok = fired_first && !fired_second;
    printf("[%s] onset cooldown: first=%d second=%d (want 1,0)\n",
           ok ? "PASS" : "FAIL", fired_first, fired_second);
    return ok;
}

static int test_bpm_tracks_interval(void) {
    /* 6 bursts at 120 BPM intervals (0.5 s apart) → tempo_bpm in [100, 140] */
    engine_init(SR, FFT_SIZE);
    push_silence_secs(1.0f); /* stabilise flux history */
    for (int i = 0; i < 6; i++) {
        push_tone_secs(1000.0f, 0.8f, 0.05f); /* burst */
        push_silence_secs(0.45f);              /* rest (burst+rest = 0.5 s = 120 BPM) */
    }
    AudioFrame f;
    engine_get_frame(&f);
    int ok = (f.tempo_bpm >= 100.0f && f.tempo_bpm <= 140.0f);
    printf("[%s] BPM tracks ~120: tempo_bpm=%.1f\n",
           ok ? "PASS" : "FAIL", f.tempo_bpm);
    return ok;
}

/* ---- Task 1 tests: spectral descriptors ---- */

static int test_centroid_low_high(void) {
    /* low sine → low centroid; high sine → high centroid; low < high */
    memset(g_buf, 0, sizeof g_buf);
    fill_sine(g_buf, SR, 200.0f, 0.8f, SR);
    push_signal(g_buf, SR);
    float c_low = spectral_centroid_norm();

    memset(g_buf, 0, sizeof g_buf);
    fill_sine(g_buf, SR, 5000.0f, 0.8f, SR);
    push_signal(g_buf, SR);
    float c_high = spectral_centroid_norm();

    int ok = (c_low  >= 0.0f && c_low  <= 1.0f &&
              c_high >= 0.0f && c_high <= 1.0f &&
              c_low < c_high);
    printf("[%s] centroid low<high: c_low=%.3f c_high=%.3f\n",
           ok ? "PASS" : "FAIL", c_low, c_high);
    return ok;
}

static int test_centroid_silence(void) {
    /* silence → Σm ≈ 0 → centroid 0 (safe default) */
    memset(g_buf, 0, sizeof g_buf);
    push_signal(g_buf, SR);
    float c = spectral_centroid_norm();
    int ok = (c == 0.0f);
    printf("[%s] centroid silence → 0  (got %.4f)\n", ok ? "PASS" : "FAIL", c);
    return ok;
}

static int test_tonalness_pure_sine(void) {
    /* 1 kHz pure sine → near-tonal (flatness → 0) */
    memset(g_buf, 0, sizeof g_buf);
    fill_sine(g_buf, SR, 1000.0f, 0.8f, SR);
    push_signal(g_buf, SR);
    float t = spectral_tonalness();
    int ok = (t > 0.7f && t <= 1.0f);
    printf("[%s] tonalness pure sine → high (%.3f)\n", ok ? "PASS" : "FAIL", t);
    return ok;
}

static int test_tonalness_noise(void) {
    /* white-ish noise → flat spectrum → low tonalness */
    srand(1234);
    for (int i = 0; i < SR; i++)
        g_buf[i] = (((float)rand() / (float)RAND_MAX) * 2.0f - 1.0f) * 0.5f;
    push_signal(g_buf, SR);
    float t_noise = spectral_tonalness();

    /* compare against a pure tone — noise must be clearly less tonal */
    memset(g_buf, 0, sizeof g_buf);
    fill_sine(g_buf, SR, 1000.0f, 0.8f, SR);
    push_signal(g_buf, SR);
    float t_sine = spectral_tonalness();

    int ok = (t_noise >= 0.0f && t_noise < 0.6f && t_noise < t_sine);
    printf("[%s] tonalness noise<sine: noise=%.3f sine=%.3f\n",
           ok ? "PASS" : "FAIL", t_noise, t_sine);
    return ok;
}

static int test_tonalness_silence(void) {
    /* silent band → safe default (finite, no NaN/Inf) */
    memset(g_buf, 0, sizeof g_buf);
    push_signal(g_buf, SR);
    float t = spectral_tonalness();
    int ok = (t >= 0.0f && t <= 1.0f); /* NaN comparisons are false → caught */
    printf("[%s] tonalness silence → safe default (%.4f)\n",
           ok ? "PASS" : "FAIL", t);
    return ok;
}

/* ---- Task 2 tests: descriptors exposed through the AudioFrame ABI ---- */

static int test_frame_descriptors_tone(void) {
    /* 1 kHz pure tone → frame.centroid and frame.tonal finite, in [0,1];
       tone is harmonic so tonal should read clearly tonal */
    memset(g_buf, 0, sizeof g_buf);
    fill_sine(g_buf, SR, 1000.0f, 0.8f, SR);
    AudioFrame f = push_signal(g_buf, SR);
    int ok = (f.centroid >= 0.0f && f.centroid <= 1.0f &&
              f.tonal    >= 0.0f && f.tonal    <= 1.0f &&
              f.tonal > 0.3f);
    printf("[%s] frame descriptors (1kHz tone): centroid=%.3f tonal=%.3f\n",
           ok ? "PASS" : "FAIL", f.centroid, f.tonal);
    return ok;
}

static int test_frame_descriptors_silence(void) {
    /* silence → centroid/tonal finite, in [0,1] (safe defaults, no NaN/Inf) */
    memset(g_buf, 0, sizeof g_buf);
    AudioFrame f = push_signal(g_buf, SR);
    int ok = (f.centroid >= 0.0f && f.centroid <= 1.0f &&
              f.tonal    >= 0.0f && f.tonal    <= 1.0f);
    printf("[%s] frame descriptors (silence): centroid=%.4f tonal=%.4f\n",
           ok ? "PASS" : "FAIL", f.centroid, f.tonal);
    return ok;
}

int main(void) {
    engine_init(SR, FFT_SIZE);

    int pass = 0, fail = 0;
    #define RUN(t) do { if (t()) pass++; else fail++; } while (0)

    RUN(test_silence);
    RUN(test_sub_sine);
    RUN(test_bass_sine);
    RUN(test_mid_sine);
    RUN(test_high_sine);
    RUN(test_energy_range);
    RUN(test_envelope_attack);
    RUN(test_beat_pulse_decay);
    RUN(test_beat_fires_on_burst);
    RUN(test_onset_fires_on_band_burst);
    RUN(test_onset_cooldown_prevents_double_fire);
    RUN(test_bpm_tracks_interval);

    RUN(test_centroid_low_high);
    RUN(test_centroid_silence);
    RUN(test_tonalness_pure_sine);
    RUN(test_tonalness_noise);
    RUN(test_tonalness_silence);

    RUN(test_frame_descriptors_tone);
    RUN(test_frame_descriptors_silence);

    printf("\n%d passed, %d failed\n", pass, fail);
    return fail ? 1 : 0;
}
