<template>
  <div class="countdown" role="timer" :aria-label="ariaLabel">
    <div class="cd-units" aria-hidden="true">
      <template v-for="(unit, index) in timeUnits" :key="unit.label">
        <span v-if="index > 0" class="cd-sep">·</span>
        <span class="cd-unit">
          <span class="cd-value">{{ unit.value }}</span>
          <span class="cd-label">{{ unit.label }}</span>
        </span>
      </template>
    </div>
    <span class="cd-caption" aria-hidden="true">1000 дней роста</span>
  </div>
</template>

<script>
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { computeRemaining } from './countdown.js'

export default {
  name: 'CountDown',
  props: {
    startDate: {
      type: [Date, String],
      default: () => new Date(1742688224657) // 23/03/2025 03:04
    },
    countdownDays: {
      type: Number,
      default: 1000
    }
  },
  setup(props, { emit }) {
    const startMs = new Date(props.startDate).getTime()

    const remainingTime = ref({ days: 0, hours: 0, minutes: 0, seconds: 0 })
    const isRunning = ref(false)
    let interval = null

    const calculateRemainingTime = () => {
      const { days, hours, minutes, seconds, finished } = computeRemaining(
        startMs,
        props.countdownDays,
        Date.now()
      )
      remainingTime.value = { days, hours, minutes, seconds }
      if (finished && isRunning.value) {
        emit('finished')
        clearInterval(interval)
        isRunning.value = false
      }
    }

    const timeUnits = computed(() => {
      const { days, hours, minutes, seconds } = remainingTime.value
      return [
        { label: 'дни', value: days.toString() },
        { label: 'часы', value: hours.toString().padStart(2, '0') },
        { label: 'мин', value: minutes.toString().padStart(2, '0') },
        { label: 'сек', value: seconds.toString().padStart(2, '0') }
      ]
    })

    const ariaLabel = computed(() => {
      const { days, hours, minutes, seconds } = remainingTime.value
      return `До конца 1000 дней роста осталось ${days} дн ${hours} ч ${minutes} мин ${seconds} с`
    })

    onMounted(() => {
      calculateRemainingTime()
      isRunning.value = true
      interval = setInterval(calculateRemainingTime, 1000)
    })

    onBeforeUnmount(() => {
      clearInterval(interval)
    })

    return { timeUnits, ariaLabel }
  }
}
</script>

<style scoped>
.countdown {
  /* size knob — each mount point tunes this var (hero vs site-header) */
  --cd-value-size: clamp(1.6rem, 4vw, 2.4rem);
  display: inline-flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: center;
  gap: 0.35em 0.7em;
  font-family: var(--ds-font-body);
  color: var(--ds-text);
}

.cd-units {
  display: inline-flex;
  align-items: baseline;
  gap: 0.34em;
}

.cd-unit {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.cd-value {
  font-family: var(--ds-font-mono);
  font-size: var(--cd-value-size);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ds-text-strong);
  /* tabular figures so the ticking seconds never shift width */
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}

.cd-sep {
  font-size: calc(var(--cd-value-size) * 0.8);
  font-weight: 600;
  color: var(--ds-text-dim);
  /* nudge the dot onto the digits' optical centre */
  transform: translateY(-0.12em);
}

.cd-label {
  margin-top: 0.45em;
  font-size: calc(var(--cd-value-size) * 0.3);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ds-text-muted);
}

.cd-caption {
  font-family: var(--ds-font-body);
  font-size: calc(var(--cd-value-size) * 0.5);
  color: var(--ds-text-muted);
  white-space: nowrap;
}

.cd-caption::before {
  content: '→ ';
  color: var(--ds-text-dim);
}
</style>
