<template>
  <header class="site-header" id="large-header">
    <canvas id="canvas"></canvas>

    <div :class="`animation-toggler ${animateHeader ? 'top-1' : 'top-2'}`">
      <a
        href="javascript:void(0)"
        @click="animateHeader = !animateHeader"
      >{{ animateHeader ? 'Выключить анимацию!' : 'Включить анимацию!' }}</a>
    </div>

    <div class="page-title" v-if="$page.title" :style="{opacity: animateHeader ? 0 : 1}">{{ $page.title }}</div>

    <CountDown v-else class="main-title" :style="{opacity: animateHeader ? 0 : 1}"
      :countdownDays="1000"
    />

  </header>
</template>

<script>
import Socials from "./Socials";
import CountDown from "./CountDown.vue";
import { WebGPUParticles, isWebGPUSupported } from "./WebGPUParticles.js";

export default {
  components: {
    Socials,
    CountDown
  },
  data: function () {
    return {
      animateHeader: false,
      useWebGPU: false,
      particles: null,
    };
  },
  computed: {
    title() {
      return this.$page.title;
    },
  },
  mounted() {
    const self = this;
    let width;
    let height;
    let raf;

    const requestAnimationFrame =
      window.requestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.msRequestAnimationFrame;

    const cancelAnimationFrame =
      window.cancelAnimationFrame || window.mozCancelAnimationFrame;

    const largeHeader = document.getElementById("large-header");
    const canvas = document.getElementById("canvas");

    // Check WebGPU support and initialize
    const initWebGPU = async () => {
      if (!isWebGPUSupported()) {
        console.log('WebGPU not supported, using Canvas 2D');
        return false;
      }
      
      self.particles = new WebGPUParticles(canvas);
      const success = await self.particles.init(width, height);
      if (success) {
        self.useWebGPU = true;
        return true;
      }
      return false;
    };

    // Fallback: Canvas 2D particles
    const COLORS = [
      'rgba(26, 204, 255, ',   // Cyan
      'rgba(255, 51, 128, ',   // Pink
      'rgba(128, 255, 77, ',   // Green
      'rgba(255, 153, 26, ',   // Orange
      'rgba(179, 77, 255, ',   // Purple
      'rgba(51, 255, 204, ',   // Teal
      'rgba(255, 230, 51, ',   // Gold
      'rgba(255, 77, 77, ',    // Red
    ];

    let ctx;
    function drawConnections2D() {
      // Dark background with slight fade for trail effect
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(2, 2, 4, 0.15)";
      canvas.width = width;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = "lighter";

      const connectDistance = 120;

      for (let i = 0; i < self.particles.length; i++) {
        const p = self.particles[i];

        // Draw connections to all nearby particles
        for (let n = i + 1; n < self.particles.length; n++) {
          const p2 = self.particles[n];
          const yd = p2.location.y - p.location.y;
          const xd = p2.location.x - p.location.x;
          const distance = Math.sqrt(xd * xd + yd * yd);

          if (distance < connectDistance) {
            // Alpha based on distance - closer = more visible
            const alpha = Math.pow(1 - distance / connectDistance, 2) * 0.6;
            
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.location.x, p.location.y);
            ctx.lineTo(p2.location.x, p2.location.y);
            // Blend colors
            ctx.strokeStyle = p.rgba + alpha + ')';
            ctx.stroke();
          }
        }

        // Update position with organic angle variation
        p.angle += Math.sin(p.location.x * 0.01 + Date.now() * 0.002) * 0.3;
        p.location.x += p.speed * Math.cos((p.angle * Math.PI) / 180);
        p.location.y += p.speed * Math.sin((p.angle * Math.PI) / 180);

        // Wrap around edges
        if (p.location.x < -50) p.location.x = width + 50;
        if (p.location.x > width + 50) p.location.x = -50;
        if (p.location.y < -50) p.location.y = height + 50;
        if (p.location.y > height + 50) p.location.y = -50;
      }

      // Draw particle dots on top
      for (let i = 0; i < self.particles.length; i++) {
        const p = self.particles[i];
        ctx.beginPath();
        ctx.arc(p.location.x, p.location.y, 2 + p.speed, 0, Math.PI * 2);
        ctx.fillStyle = p.rgba + '0.9)';
        ctx.fill();
      }
    }

    function initHeader() {
      cancelAnimationFrame(raf);
      width = window.innerWidth;
      height = window.innerWidth / (self.$page.path === "/" ? 2 : 4);
      largeHeader.style.height = height + "px";
      largeHeader.style.width = width + "px";
      largeHeader.style.overflow = "hidden";

      canvas.width = width;
      canvas.height = height;

      // Try WebGPU first, fallback to 2D
      if (!self.useWebGPU && isWebGPUSupported()) {
        initWebGPU().then(success => {
          if (success) {
            // Render first frame immediately (background)
            self.particles.render();
          } else {
            initCanvas2D();
            if (self.animateHeader) {
              raf = requestAnimationFrame(draw);
            }
          }
        });
      } else if (!self.useWebGPU) {
        initCanvas2D();
        if (self.animateHeader) {
          raf = requestAnimationFrame(draw);
        }
      } else if (self.particles) {
        self.particles.resize(width, height);
        self.particles.render();
      }
    }

    function initCanvas2D() {
      ctx = canvas.getContext("2d");
      self.particles = [];
      // Double the particles!
      const numOfParticles = Math.floor(height / 2.5);

      for (let i = 0; i < numOfParticles; i++) {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const alpha = 0.4 + Math.random() * 0.5;
        self.particles.push({
          location: {
            x: Math.random() * width,
            y: Math.random() * height,
          },
          speed: 0.3 + Math.random() * 1.2,
          angle: Math.random() * 360,
          rgba: color + alpha + ')',
        });
      }
      drawConnections2D();
    }

    function draw() {
      if (self.animateHeader) {
        if (self.useWebGPU && self.particles) {
          // WebGPU handles its own render loop
        } else {
          drawConnections2D();
        }
      }
      raf = requestAnimationFrame(draw);
    }

    function addListeners() {
      window.addEventListener("scroll", disableWhenScrolledHalf);
      window.addEventListener("resize", initHeader);
    }

    function disableWhenScrolledHalf() {
      self.animateHeader =
        self.animateHeader && document.documentElement.scrollTop < height / 2;
    }

    // Initial start - только для 2D, WebGPU запустится через watch
    addListeners();
    initHeader();
  },
  beforeDestroy() {
    // Cleanup
    if (raf) {
      cancelAnimationFrame(raf);
    }
    if (this.particles && this.particles.destroy) {
      this.particles.destroy();
    }
  },
  watch: {
    animateHeader(val) {
      if (val) {
        // Start animation from where it stopped (state preserved in particles buffer)
        if (this.useWebGPU && this.particles) {
          this.particles.start();
        } else {
          // For 2D, just restart the draw loop
          raf = requestAnimationFrame(draw);
        }
      } else {
        // Stop animation, state is preserved
        if (this.useWebGPU && this.particles) {
          this.particles.stop();
        } else {
          if (raf) {
            cancelAnimationFrame(raf);
            raf = null;
          }
        }
      }
    },
  },
};
</script>

<style lang="stylus">
.site-header {

  .fullscreen {
    position:fixed;
    left:0;
    top:0;
    width:100%;
    height:100%;
  }

  position: relative;
  background: #111;
  background-size: cover;
  background-position: center center;
  z-index: 1;
  color: #fff;
  .animation-toggler {
    position: absolute;
    right: 2rem;
    font-size: 1rem;

    a {
      color: yellow;
      font-size: 0.825em;
      text-decoration: none;
      border-bottom: 1px dotted pink;
    }

    &.top-1 {
      top: 1em;
    }

    &.top-2 {
      top: 2em;
    }
  }

  .page-title {
    color: white;
    font-size: calc(1.3em + 3vw);
    letter-spacing: -1px;
    position: absolute;
    margin: 0;
    padding: 0;
    text-align: center;
    top: 50%;
    left: 50%;
    -webkit-transform: translate3d(-50%, -50%, 0);
    transform: translate3d(-50%, -50%, 0);
    transition: opacity 2s ease-in-out 1s;
    transition: transform 2s ease-in-out 1s;

  }

  .main-title {
    font-size: 5vw;
    letter-spacing: -1px;
    line-height: 1.15;
    position: absolute;
    margin: 0;
    padding: 0;
    text-align: center;
    top: 50%;
    left: 50%;
    -webkit-transform: translate3d(-50%, -50%, 0);
    transform: translate3d(-50%, -50%, 0);
    transition: opacity 2s ease-in-out 1s;
    sup {
      top: -2.25em;
      font-size: 0.25em;

      a {
        color: pink;

        &:hover {
          color: #fdfdfd;
        }
      }
    }

    a {
      color: #fdfdfd;
      text-decoration: none;
    }

    a:hover {
      color: pink;
    }
  }
}
</style>

