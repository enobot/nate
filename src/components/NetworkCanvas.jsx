import { useEffect, useRef } from "react";

// Tuning values for the hero background "network topology" effect.
const AREA_PER_NODE = 16000; // one node per this many CSS pixels of canvas area
const MIN_NODES = 18;
const MAX_NODES = 80;
const LINK_DISTANCE = 140; // nodes closer than this are connected by a line
const POINTER_RADIUS = 150; // how far the pointer "probe" reaches
const BASE_SPEED = 0.22; // pixels per frame (at 60 fps)
const MAX_PACKETS = 5;
const PACKET_INTERVAL_MS = 450;

// Accent colors as "r, g, b" strings so alpha can be added per draw call.
const NODE_COLORS = ["168, 85, 247", "61, 123, 255", "34, 227, 245"];
const LINK_COLOR = "120, 160, 255";
const POINTER_COLOR = "34, 227, 245";

/** Pick how many nodes to draw for a canvas of this size. */
export function nodeCountFor(width, height) {
  const count = Math.round((width * height) / AREA_PER_NODE);
  return Math.min(MAX_NODES, Math.max(MIN_NODES, count));
}

function createNode(width, height) {
  const angle = Math.random() * Math.PI * 2;
  const speed = BASE_SPEED * (0.4 + Math.random() * 0.8);
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    // Extra velocity from the pointer push; decays back to zero.
    px: 0,
    py: 0,
    r: 1.2 + Math.random() * 1.4,
    hub: Math.random() < 0.12,
    color: NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)],
  };
}

/**
 * Decorative animated network of nodes and links behind the hero.
 *
 * Performance and accessibility safeguards:
 * - devicePixelRatio is capped at 2 so 3x phone screens don't triple the work.
 * - Node count scales with the canvas area (between MIN_NODES and MAX_NODES).
 * - The animation pauses when the canvas is off-screen (IntersectionObserver)
 *   or the browser tab is hidden.
 * - With "prefers-reduced-motion: reduce", a single still frame is drawn.
 * - Every listener, observer and animation frame is cleaned up on unmount.
 * - The canvas is aria-hidden: it carries no information.
 */
export default function NetworkCanvas({ className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;

    const host = canvas.parentElement ?? canvas;
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    let reducedMotion = Boolean(motionQuery?.matches);
    let onScreen = true;
    let running = false;
    let frameId = 0;
    let lastTime = 0;
    let lastPacketTime = 0;
    let width = 0;
    let height = 0;
    let nodes = [];
    let packets = [];
    const pointer = { x: 0, y: 0, active: false };

    function seed() {
      nodes = Array.from({ length: nodeCountFor(width, height) }, () => createNode(width, height));
      packets = [];
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const countChanged = nodeCountFor(nextWidth, nextHeight) !== nodes.length;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (countChanged) {
        seed();
      } else {
        // Small size change (e.g. mobile address bar): keep nodes, just clamp them.
        for (const node of nodes) {
          node.x = Math.min(node.x, width);
          node.y = Math.min(node.y, height);
        }
      }
      if (!running) draw();
    }

    function spawnPacket() {
      if (packets.length >= MAX_PACKETS || nodes.length < 2) return;
      const from = nodes[Math.floor(Math.random() * nodes.length)];
      const neighbor = nodes.find(
        (node) => node !== from && Math.hypot(node.x - from.x, node.y - from.y) < LINK_DISTANCE,
      );
      if (neighbor) packets.push({ from, to: neighbor, t: 0, speed: 0.012 + Math.random() * 0.01 });
    }

    function step(dt) {
      for (const node of nodes) {
        if (pointer.active) {
          const dx = node.x - pointer.x;
          const dy = node.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0 && dist < POINTER_RADIUS) {
            // Gentle push away from the pointer.
            const force = (1 - dist / POINTER_RADIUS) * 0.05;
            node.px += (dx / dist) * force;
            node.py += (dy / dist) * force;
          }
        }
        node.px *= 0.94;
        node.py *= 0.94;
        node.x += (node.vx + node.px) * dt;
        node.y += (node.vy + node.py) * dt;

        // Bounce off the edges.
        if (node.x < 0 || node.x > width) {
          node.vx *= -1;
          node.x = Math.min(Math.max(node.x, 0), width);
        }
        if (node.y < 0 || node.y > height) {
          node.vy *= -1;
          node.y = Math.min(Math.max(node.y, 0), height);
        }
      }

      packets = packets.filter((packet) => {
        packet.t += packet.speed * dt;
        const linkLength = Math.hypot(packet.to.x - packet.from.x, packet.to.y - packet.from.y);
        return packet.t < 1 && linkLength < LINK_DISTANCE * 1.2;
      });
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;

      // Links between nearby nodes.
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < LINK_DISTANCE) {
            ctx.strokeStyle = `rgba(${LINK_COLOR}, ${(1 - dist / LINK_DISTANCE) * 0.32})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Pointer "probe" lines.
      if (pointer.active) {
        for (const node of nodes) {
          const dist = Math.hypot(node.x - pointer.x, node.y - pointer.y);
          if (dist < POINTER_RADIUS) {
            ctx.strokeStyle = `rgba(${POINTER_COLOR}, ${(1 - dist / POINTER_RADIUS) * 0.45})`;
            ctx.beginPath();
            ctx.moveTo(pointer.x, pointer.y);
            ctx.lineTo(node.x, node.y);
            ctx.stroke();
          }
        }
      }

      // Data packets travelling along links.
      for (const packet of packets) {
        const x = packet.from.x + (packet.to.x - packet.from.x) * packet.t;
        const y = packet.from.y + (packet.to.y - packet.from.y) * packet.t;
        ctx.fillStyle = `rgba(${POINTER_COLOR}, 0.18)`;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${POINTER_COLOR}, 0.95)`;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Nodes (hubs get a halo ring).
      for (const node of nodes) {
        if (node.hub) {
          ctx.strokeStyle = `rgba(${node.color}, 0.35)`;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(${node.color}, 0.9)`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.hub ? node.r + 1 : node.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function loop(time) {
      // dt = 1 at 60 fps; clamped so a slow frame doesn't teleport nodes.
      const dt = Math.min((time - lastTime) / 16.67, 3);
      lastTime = time;
      if (time - lastPacketTime > PACKET_INTERVAL_MS) {
        lastPacketTime = time;
        spawnPacket();
      }
      step(dt);
      draw();
      frameId = window.requestAnimationFrame(loop);
    }

    function updateRunning() {
      const shouldRun = !reducedMotion && onScreen && !document.hidden;
      if (shouldRun && !running) {
        running = true;
        lastTime = performance.now();
        frameId = window.requestAnimationFrame(loop);
      } else if (!shouldRun && running) {
        running = false;
        window.cancelAnimationFrame(frameId);
      }
      if (!shouldRun) draw(); // leave a still frame on screen
    }

    function handlePointerMove(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    }
    function handlePointerLeave() {
      pointer.active = false;
    }
    function handleVisibility() {
      updateRunning();
    }
    function handleMotionChange(event) {
      reducedMotion = event.matches;
      if (reducedMotion) pointer.active = false;
      updateRunning();
    }

    resize();

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }

    let intersectionObserver = null;
    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        updateRunning();
      });
      intersectionObserver.observe(canvas);
    }

    document.addEventListener("visibilitychange", handleVisibility);
    motionQuery?.addEventListener?.("change", handleMotionChange);
    host.addEventListener("pointermove", handlePointerMove, { passive: true });
    host.addEventListener("pointerleave", handlePointerLeave);

    updateRunning();

    return () => {
      running = false;
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      motionQuery?.removeEventListener?.("change", handleMotionChange);
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
