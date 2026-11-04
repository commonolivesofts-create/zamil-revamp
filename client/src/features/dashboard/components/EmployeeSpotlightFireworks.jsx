import { useEffect, useRef } from "react";
import { shouldReduceMotion } from "../useDashboardMotion.js";

const DARK_COLORS = ["#ff456a", "#ffb703", "#00d6c7", "#8b5cf6", "#38bdf8", "#ff7b36"];
const LIGHT_COLORS = ["#bd2447", "#a86400", "#007f78", "#6532bd", "#126e9f", "#bd4d13"];

export default function EmployeeSpotlightFireworks() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || shouldReduceMotion()) return undefined;

    let width = 0;
    let height = 0;
    let inView = false;
    let running = false;
    let frame = 0;
    let burstTimeout = 0;
    let previousFrameTime = 0;
    let particles = [];

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const burst = (x, y) => {
      const darkMode = document.documentElement.classList.contains("dark");
      const palette = darkMode ? DARK_COLORS : LIGHT_COLORS;
      const color = palette[Math.floor(Math.random() * palette.length)];

      for (let index = 0; index < 60; index += 1) {
        const angle = (index / 60) * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3.5;
        particles.push({
          x,
          y,
          previousX: x,
          previousY: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          duration: 0.85 + Math.random() * 0.45,
          size: 1 + Math.random() * 2,
          color: Math.random() < 0.2 ? (darkMode ? "#ffd76a" : "#9a5d00") : color,
        });
      }
    };

    const animate = (timestamp) => {
      if (!running) return;
      const elapsed = previousFrameTime ? Math.min((timestamp - previousFrameTime) / 1000, 0.05) : 1 / 60;
      const frameScale = elapsed * 60;
      previousFrameTime = timestamp;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = document.documentElement.classList.contains("dark") ? "lighter" : "source-over";
      particles = particles.filter((particle) => particle.life > 0);

      if (particles.length === 0) {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        previousFrameTime = 0;
        frame = 0;
        scheduleNextBurst();
        return;
      }

      for (const particle of particles) {
        particle.previousX = particle.x;
        particle.previousY = particle.y;
        particle.x += particle.vx * frameScale;
        particle.y += particle.vy * frameScale;
        particle.vx *= 0.986 ** frameScale;
        particle.vy += 0.034 * frameScale;
        particle.life -= elapsed / particle.duration;

        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = particle.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(particle.previousX, particle.previousY);
        ctx.lineTo(particle.x - particle.vx * 3, particle.y - particle.vy * 3);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      frame = window.requestAnimationFrame(animate);
    };

    const launchBurst = () => {
      if (!running) return;
      burst(width * (0.2 + Math.random() * 0.6), height * (0.2 + Math.random() * 0.5));
      previousFrameTime = 0;
      frame = window.requestAnimationFrame(animate);
    };

    const scheduleNextBurst = () => {
      if (!running) return;
      burstTimeout = window.setTimeout(launchBurst, 2000);
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      resize();
      launchBurst();
    };

    const stop = () => {
      running = false;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(burstTimeout);
      particles = [];
      previousFrameTime = 0;
      ctx.clearRect(0, 0, width, height);
    };

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              inView = entry.isIntersecting;
              if (inView) start();
              else stop();
            },
            { threshold: 0.05 },
          );
    if (observer) observer.observe(canvas);
    else {
      inView = true;
      start();
    }

    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else if (inView) start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resize);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
      resizeObserver?.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="employee-spotlight-fireworks" aria-hidden="true" />;
}
