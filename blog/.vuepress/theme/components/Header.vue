<template>
  <header class="site-header" id="large-header">
    <canvas id="canvas"></canvas>

    <div :class="`animation-toggler ${animateHeader ? 'top-1' : 'top-2'}`">
      <a
        href="javascript:void(0)"
        @click="animateHeader = !animateHeader"
      >{{ animateHeader ? 'Выкл!' : 'Вкл!' }}</a>
    </div>

    <div class="page-title" v-if="$page.title">{{ $page.title }}</div>

    <div v-else class="main-title">
      <router-link to="/" class="site-title">{{ $site.title }}</router-link>
      <sup>
        <router-link to="/about" class="page-link">Что это?</router-link>
      </sup>
      <Socials />
    </div>
  </header>
</template>

<script>
import Socials from "./Socials";

export default {
  components: {
    Socials,
  },
  data: function () {
    return {
      animateHeader: false,
    };
  },
  computed: {
    title() {
      return this.$page.title;
    },
  },
  mounted() {
    const self = this;

    const requestAnimationFrame =
      window.requestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.msRequestAnimationFrame;

    const cancelAnimationFrame =
      window.cancelAnimationFrame || window.mozCancelAnimationFrame;

    let points;
    let particles;
    let numOfParticles;
    let largeHeader = document.getElementById("large-header");
    let canvas =
      "OffscreenCanvas" in window
        ? document.getElementById("canvas").transferControlToOffscreen()
        : document.getElementById("canvas");
    let ctx = canvas.getContext("2d");
    let width;
    let height;
    let raf;
    // Main
    initHeader();
    addListeners();

    function Particle() {
      this.location = {
        x: Math.random() * width,
        y: Math.random() * height,
      };
      this.speed = Math.random();
      this.angle = Math.random() * 360;

      const r = Math.round(Math.random() * 255);
      const g = Math.round(Math.random() * 255);
      const b = Math.round(Math.random() * 255);
      const a = Math.random() * 0.5;
      this.rgba = "rgba(" + r + ", " + g + "," + b + ", " + a + ")";
    }

    function drawConnections() {
      // ctx.globalCompositeOperation = "source-over";
      // ctx.fillStyle = "rgba(1, 1, 1, 0.2)";
      canvas.width = width;
      // ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx.beginPath();

        for (let n = 0; n < particles.length; n++) {
          const p2 = particles[n];
          const yd = p2.location.y - p.location.y;
          const xd = p2.location.x - p.location.x;
          const distance = Math.sqrt(xd * xd + yd * yd);

          if (distance < 140) {
            ctx.lineWidth = 1;
            ctx.moveTo(p.location.x, p.location.y);
            ctx.lineTo(p2.location.x, p2.location.y);
          }
        }
        ctx.strokeStyle = p.rgba;
        ctx.stroke();

        p.location.x =
          p.location.x + p.speed * Math.cos((p.angle * Math.PI) / 180);
        p.location.y =
          p.location.y + p.speed * Math.sin((p.angle * Math.PI) / 180);

        if (p.location.x < 0) p.location.x = width + 50;
        if (p.location.x > width + 50) p.location.x = 0;
        if (p.location.y < 0) p.location.y = height + 50;
        if (p.location.y > height + 50) p.location.y = 0;
      }
    }

    function initHeader() {
      cancelAnimationFrame(raf);
      width = window.innerWidth;
      height = window.innerWidth / (self.$page.path === "/" ? 2 : 4);
      largeHeader.style.height = height + "px";
      largeHeader.style.width = width + "px";

      canvas.width = width;
      canvas.height = height;

      particles = [];

      numOfParticles = height / 5;

      for (var i = 0; i < numOfParticles; i++) {
        particles.push(new Particle());
      }
      drawConnections()

      function draw(secondsFromStart) {
        if (self.animateHeader) {
          drawConnections();
        }
        raf = requestAnimationFrame(draw);
      }

      //setInterval(draw, 3)
      raf = requestAnimationFrame(draw);
    }

    // Event handling
    function addListeners() {
      window.addEventListener("scroll", scrollCheck);
      window.addEventListener("resize", initHeader);
    }
    function scrollCheck() {
      self.animateHeader =
        self.animateHeader && document.documentElement.scrollTop < height / 2;
    }
  },
};
</script>

<style lang="stylus">
.site-header {
  position: relative;
  width: 100%;
  background: #111;
  overflow: hidden;
  background-size: cover;
  background-position: center center;
  z-index: 1;

  .animation-toggler {
    position: absolute;
    right: 1em;

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
    font-size: 2rem;
    letter-spacing: -1px;
    position: absolute;
    margin: 0;
    padding: 0;
    text-align: center;
    top: 50%;
    left: 50%;
    -webkit-transform: translate3d(-50%, -50%, 0);
    transform: translate3d(-50%, -50%, 0);
  }

  .main-title {
    font-size: 3rem;
    letter-spacing: -1px;
    line-height: 1.75;
    position: absolute;
    margin: 0;
    padding: 0;
    text-align: center;
    top: 50%;
    left: 50%;
    -webkit-transform: translate3d(-50%, -50%, 0);
    transform: translate3d(-50%, -50%, 0);

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
