#pragma once
#include <stdint.h>

typedef struct {
    float energy;       /* RMS 0..1 (all bands) */
    float sub;          /* 20–80 Hz (envelope-followed) */
    float bass;         /* 80–250 Hz */
    float mid;          /* 250–4000 Hz */
    float high;         /* 4000–16000 Hz */
    float beat_pulse;   /* 0..1, spike + exponential decay ~0.1s */
    float onset[4];     /* per-band onset flags (0 or 1, with cooldown) */
    float tempo_bpm;    /* rolling average BPM */
    float centroid;     /* spectral centroid, log-normalized 0..1 (timbre brightness) */
    float tonal;        /* spectral tonalness/harmonicity 0..1 (timbre → color) */
} AudioFrame;

/* lifecycle */
void engine_init(int sample_rate, int fft_size);
void engine_reset(void);

/* feed raw PCM samples (mono float -1..1) */
void engine_push_samples(const float *buf, int n);

/* read the latest computed frame */
void engine_get_frame(AudioFrame *out);

/* configure per-band envelope follower (attack/release in seconds) */
void engine_set_envelope(int band, float attack, float release);
