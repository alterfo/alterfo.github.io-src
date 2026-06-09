<template>
    <div class="countdown-container">
      <h2>1000 дней роста</h2>
      <div class="timer-circles">
        <div v-for="(unit, index) in timeUnits" :key="unit.label" class="timer-circle">
          <svg class="progress-ring" width="200" height="200">
            <circle
              class="progress-ring-circle-bg"
              stroke-width="8"
              fill="transparent"
              r="80"
              cx="100"
              cy="100"
            />
            <circle
              class="progress-ring-circle"
              :stroke="colors[index % colors.length]"
              stroke-width="8"
              fill="transparent"
              r="80"
              cx="100"
              cy="100"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="unit.dashOffset"
            />
          </svg>
          <div class="time-display">
            <span class="time-value">{{ unit.value }}</span>
          </div>
          <span class="time-label">{{ unit.label }}</span>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
  import { computeRemaining, ringOffset } from './countdown.js'
  import { SPECTRUM } from './spectrum.js'

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
      // Fix: Use the correct radius (80) for circumference calculation
      const circumference = 2 * Math.PI * 80
      // Rings colored by the design-system spectrum («сферы круга жизни»)
      const colors = SPECTRUM
      
      const startDateObj = ref(new Date(props.startDate))
      const targetDate = computed(() => {
        const target = new Date(startDateObj.value)
        target.setDate(target.getDate() + props.countdownDays)
        return target
      })
      
      const remainingTime = ref({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0
      })
          
      const totalTimeInSeconds = computed(() => {
        return props.countdownDays * 24 * 60 * 60
      })
      
      const elapsedTimeInSeconds = computed(() => {
        const now = new Date()
        const elapsed = (now.getTime() - startDateObj.value.getTime()) / 1000
        return Math.max(0, Math.min(elapsed, totalTimeInSeconds.value))
      })
      
      const progressPercentage = computed(() => {
        return elapsedTimeInSeconds.value / totalTimeInSeconds.value
      })
      
      const isRunning = ref(false)
      let interval = null
      
      const calculateRemainingTime = () => {
        const { days, hours, minutes, seconds, finished } = computeRemaining(
          startDateObj.value.getTime(),
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
          {
            label: 'Days',
            value: days.toString(),
            // progress through the total countdown period (e.g. 1000 days)
            dashOffset: ringOffset(days, props.countdownDays, circumference)
          },
          {
            label: 'Hours',
            value: hours.toString().padStart(2, '0'),
            dashOffset: ringOffset(hours, 24, circumference)
          },
          {
            label: 'Minutes',
            value: minutes.toString().padStart(2, '0'),
            dashOffset: ringOffset(minutes, 60, circumference)
          },
          {
            label: 'Seconds',
            value: seconds.toString().padStart(2, '0'),
            dashOffset: ringOffset(seconds, 60, circumference)
          }
        ]
      })
      
      const formatDate = (date) => {
        return new Date(date).toLocaleString()
      }
      
      const start = () => {
        calculateRemainingTime()
        if (remainingTime.value.days === 0 && 
            remainingTime.value.hours === 0 && 
            remainingTime.value.minutes === 0 && 
            remainingTime.value.seconds === 0) {
          // Reset logic would go here if needed
        }
        
        isRunning.value = true
        interval = setInterval(() => {
          calculateRemainingTime()
        }, 1000)
      }
    
      
      onMounted(() => {
        start()
      })
      
      onBeforeUnmount(() => {
        clearInterval(interval)
      })
      
      return {
        timeUnits,
        isRunning,
        circumference,
        colors,
        startDate: startDateObj,
        targetDate,
        formatDate,
        start
      }
    }
  }
  </script>
  
  <style scoped>
  .countdown-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem;
    font-family: var(--ds-font-body);
    color: var(--ds-text);
  }

  .countdown-container h2 {
    font-family: var(--ds-font-display);
    color: var(--ds-text-strong);
  }

  .timer-circles {
    display: flex;
    flex-wrap: nowrap;
    justify-content: center;
    gap: .5rem;
    margin-bottom: .5rem;
  }
  
  .timer-circle {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
  }
  
  .progress-ring-circle-bg {
    stroke: var(--ds-text-dim);
    transition: stroke-dashoffset 0.5s;
    transform: rotate(-90deg);
    transform-origin: 50% 50%;
  }
  
  .progress-ring-circle {
    transition: stroke-dashoffset 1s;
    transform: rotate(-90deg);
    transform-origin: 50% 50%;
  }
  
  .progress-ring {
    margin-bottom: -1rem;
  }
  
  .time-display {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  
  .time-value {
    font-size: 3rem;
    font-weight: bold;
    color: var(--ds-text);
  }

  .time-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    margin-top: 0.2rem;
    color: var(--ds-text-muted);
  }

  @media (max-width: 768px) {
    .timer-circles {
      gap: 1rem;
    }
    
    .progress-ring {
      width: 100px;
      height: 100px;
    }
    
    .progress-ring-circle, .progress-ring-circle-bg {
      r: 40;
      cx: 50;
      cy: 50;
    }
    
    .time-value {
      font-size: 1.5rem;
    }
  }
  
  @media (max-width: 576px) {
    .timer-circles {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
    }
  }
  </style>