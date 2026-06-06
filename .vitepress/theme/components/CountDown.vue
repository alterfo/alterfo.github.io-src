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
      const colors = ['#45B7D1', '#4ECDC4',  '#FFA500', '#FF6B6B']
      
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
        const now = new Date()
        const timeDiff = targetDate.value.getTime() - now.getTime()
        
        if (timeDiff <= 0) {
          remainingTime.value = { days: 0, hours: 0, minutes: 0, seconds: 0 }
          if (isRunning.value) {
            emit('finished')
          }
          return
        }
        
        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000)
        
        remainingTime.value = { days, hours, minutes, seconds }
      }
      
      const timeUnits = computed(() => {
        // For days: progress through the total countdown period (1000 days)
        const daysProgress = remainingTime.value.days / props.countdownDays
        const daysOffset = circumference * (1 - daysProgress)
        
        // For hours: progress through 24 hours
        const hoursProgress = remainingTime.value.hours / 24
        const hoursOffset = circumference * (1 - hoursProgress)
        
        // For minutes: progress through 60 minutes
        const minutesProgress = remainingTime.value.minutes / 60
        const minutesOffset = circumference * (1 - minutesProgress)
        
        // For seconds: progress through 60 seconds
        const secondsProgress = remainingTime.value.seconds / 60
        const secondsOffset = circumference * (1 - secondsProgress)
        
        return [
          {
            label: 'Days',
            value: remainingTime.value.days.toString(),
            dashOffset: daysOffset
          },
          {
            label: 'Hours',
            value: remainingTime.value.hours.toString().padStart(2, '0'),
            dashOffset: hoursOffset
          },
          {
            label: 'Minutes',
            value: remainingTime.value.minutes.toString().padStart(2, '0'),
            dashOffset: minutesOffset
          },
          {
            label: 'Seconds',
            value: remainingTime.value.seconds.toString().padStart(2, '0'),
            dashOffset: secondsOffset
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
    font-family: 'Arial', sans-serif;
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
    stroke: #f1f1f1;
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
  }
  
  .time-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    margin-top: 0.2rem;
    color: #fff;
  }
  
  .date-info {
    margin-bottom: 1.5rem;
    text-align: center;
    color: #fff;
  }
  
  .date-info p {
    margin: 0.5rem 0;
  }
  
  .controls {
    display: flex;
    gap: 1rem;
  }
  
  .control-button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 4px;
    background-color: #4ECDC4;
    color: white;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.3s;
  }
  
  .control-button:hover {
    background-color: #3dbdb5;
  }
  
  .control-button.reset {
    background-color: #FF6B6B;
  }
  
  .control-button.reset:hover {
    background-color: #ff5252;
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
    
    .date-info {
      font-size: 0.9rem;
    }
  }
  </style>