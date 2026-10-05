"use client";

// The intro: a footballer kicks the ball, the ball flies to the centre and becomes the
// Silver Jubilee emblem, which then shrinks into the header. Loaded on demand by IntroGate,
// so visitors who don't see it never download this code. Only transforms and opacity animate.
import Image from "next/image";
import { LazyMotion, animate, domAnimation, m, useReducedMotion, type Easing } from "motion/react";
import { useEffect, useRef, useState } from "react";
import emblem from "@/assets/intro-emblem.webp";
import emblemMask from "@/assets/intro-emblem-mask.webp";

const FIGURE = "#135463"; // brand teal (--brand)
const INK = "#1B2230";
const LOGO = 200; // emblem diameter, px

// Stage: a fixed 360 x 640 box centred in the viewport; positions below are in its pixels.
const STAGE_W = 360;
const STAGE_H = 640;
const LOGO_C = { x: 180, y: 250 };
const PLAYER = { left: 0, top: 372, width: 160 }; // SVG box; viewBox 200 x 240
const SCALE = PLAYER.width / 200;

const CONTACT = 0.8; // s: boot meets ball
const ARRIVE = 1.55; // s: ball reaches the centre
const EXIT = 2.45; // s: earliest moment the emblem heads for the header
const HOLD_MAX = 1.0; // s: extra time the settled emblem may wait for the page's data
const EXIT_DURATION = 0.5;

// ---------------------------------------------------------------------------
// The footballer: pictogram capsules on a jointed skeleton (SVG user units, facing right).
// Joint angles are applied as SVG rotate(angle, pivotX, pivotY), so every limb turns about
// its real joint. Positive angles swing a limb backward.
// ---------------------------------------------------------------------------

const HIP = { x: 98, y: 114 };
const SHOULDER = { x: 107, y: 58 };
const THIGH = 44;
const SHIN = 44;
const UPPER_ARM = 30;
const FOREARM = 24;
const KNEE = { x: HIP.x, y: HIP.y + THIGH };
const ELBOW = { x: SHOULDER.x, y: SHOULDER.y + UPPER_ARM };

type Pose = {
  t: number;
  x: number; // whole figure, SVG units
  y: number;
  torso: number;
  kickThigh: number; kickShin: number; // near leg, the one that kicks
  standThigh: number; standShin: number; // far leg
  nearArm: number; nearFore: number;
  farArm: number; farFore: number;
};

// Two running strides, plant and backswing, strike, follow-through.
const POSES: Pose[] = [
  { t: 0.0, x: -84, y: 0, torso: 11, kickThigh: -32, kickShin: 42, standThigh: 26, standShin: 78, nearArm: 32, nearFore: -84, farArm: -30, farFore: -62 },
  { t: 0.17, x: -63, y: -5, torso: 11, kickThigh: 26, kickShin: 80, standThigh: -32, standShin: 40, nearArm: -30, nearFore: -62, farArm: 32, farFore: -84 },
  { t: 0.34, x: -42, y: 0, torso: 11, kickThigh: -32, kickShin: 42, standThigh: 26, standShin: 78, nearArm: 32, nearFore: -84, farArm: -30, farFore: -62 },
  { t: 0.52, x: -6, y: -3, torso: 6, kickThigh: 30, kickShin: 70, standThigh: -20, standShin: 16, nearArm: 30, nearFore: -60, farArm: -40, farFore: -50 },
  { t: 0.66, x: 0, y: 0, torso: 2, kickThigh: 46, kickShin: 108, standThigh: -16, standShin: 16, nearArm: 48, nearFore: -40, farArm: -78, farFore: -30 },
  { t: CONTACT, x: 0, y: 0, torso: -6, kickThigh: -22, kickShin: 10, standThigh: -16, standShin: 12, nearArm: 58, nearFore: -30, farArm: -104, farFore: -18 },
  { t: 0.94, x: 0, y: 0, torso: -13, kickThigh: -84, kickShin: 6, standThigh: 6, standShin: 12, nearArm: 52, nearFore: -34, farArm: -96, farFore: -22 },
  { t: 1.25, x: 0, y: 0, torso: -8, kickThigh: -58, kickShin: 22, standThigh: 4, standShin: 10, nearArm: 40, nearFore: -40, farArm: -70, farFore: -34 },
];
const POSE_END = POSES[POSES.length - 1].t;

const smooth = (u: number) => u * u * (3 - 2 * u);
function poseAt(t: number): Pose {
  const i = Math.max(0, POSES.findIndex((p) => p.t > t) - 1);
  const a = POSES[i];
  const b = POSES[Math.min(i + 1, POSES.length - 1)];
  const u = b.t === a.t ? 1 : smooth(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof Pose)[]) out[key] = a[key] + (b[key] - a[key]) * u;
  return out;
}

// Toe position at contact, from the joint angles: the ball sits just ahead of it.
const rad = (d: number) => (d * Math.PI) / 180;
const CONTACT_POSE = poseAt(CONTACT);
const KNEE_AT = {
  x: HIP.x - THIGH * Math.sin(rad(CONTACT_POSE.kickThigh)),
  y: HIP.y + THIGH * Math.cos(rad(CONTACT_POSE.kickThigh)),
};
const SHIN_ANGLE = CONTACT_POSE.kickThigh + CONTACT_POSE.kickShin;
const ANKLE_AT = { x: KNEE_AT.x - SHIN * Math.sin(rad(SHIN_ANGLE)), y: KNEE_AT.y + SHIN * Math.cos(rad(SHIN_ANGLE)) };
const BALL_R = 10;
const BALL_SVG = { x: ANKLE_AT.x + 14, y: ANKLE_AT.y };
const BALL_START = {
  x: PLAYER.left + BALL_SVG.x * SCALE - LOGO_C.x,
  y: PLAYER.top + BALL_SVG.y * SCALE - LOGO_C.y,
  scale: (BALL_R * 2 * SCALE) / LOGO,
};

function Capsule({ x, y, length, width, opacity }: { x: number; y: number; length: number; width: number; opacity: number }) {
  return <line x1={x} y1={y} x2={x} y2={y + length} stroke={FIGURE} strokeWidth={width} strokeLinecap="round" opacity={opacity} />;
}

function Footballer() {
  const body = useRef<SVGGElement>(null);
  const torso = useRef<SVGGElement>(null);
  const kickThigh = useRef<SVGGElement>(null);
  const kickShin = useRef<SVGGElement>(null);
  const standThigh = useRef<SVGGElement>(null);
  const standShin = useRef<SVGGElement>(null);
  const nearArm = useRef<SVGGElement>(null);
  const nearFore = useRef<SVGGElement>(null);
  const farArm = useRef<SVGGElement>(null);
  const farFore = useRef<SVGGElement>(null);
  const ball = useRef<SVGGElement>(null);

  useEffect(() => {
    const rot = (el: SVGGElement | null, a: number, p: { x: number; y: number }) =>
      el?.setAttribute("transform", `rotate(${a.toFixed(2)} ${p.x} ${p.y})`);
    const apply = (t: number) => {
      const p = poseAt(t);
      body.current?.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
      rot(torso.current, p.torso, HIP);
      rot(kickThigh.current, p.kickThigh, HIP);
      rot(kickShin.current, p.kickShin, KNEE);
      rot(standThigh.current, p.standThigh, HIP);
      rot(standShin.current, p.standShin, KNEE);
      rot(nearArm.current, p.nearArm, SHOULDER);
      rot(nearFore.current, p.nearFore, ELBOW);
      rot(farArm.current, p.farArm, SHOULDER);
      rot(farFore.current, p.farFore, ELBOW);
      ball.current?.setAttribute("opacity", t < CONTACT ? "1" : "0");
    };
    apply(0);
    const controls = animate(0, POSE_END, { duration: POSE_END, ease: "linear", onUpdate: apply });
    return () => controls.stop();
  }, []);

  const leg = (thigh: typeof kickThigh, shin: typeof kickShin, opacity: number) => (
    <g ref={thigh}>
      <Capsule x={HIP.x} y={HIP.y} length={THIGH} width={15} opacity={opacity} />
      <g ref={shin}>
        <Capsule x={KNEE.x} y={KNEE.y} length={SHIN} width={12} opacity={opacity} />
        <line x1={KNEE.x} y1={KNEE.y + SHIN + 2} x2={KNEE.x + 12} y2={KNEE.y + SHIN + 3} stroke={FIGURE} strokeWidth={9} strokeLinecap="round" opacity={opacity} />
      </g>
    </g>
  );
  const arm = (upper: typeof nearArm, fore: typeof nearFore, opacity: number) => (
    <g ref={upper}>
      <Capsule x={SHOULDER.x} y={SHOULDER.y} length={UPPER_ARM} width={10} opacity={opacity} />
      <g ref={fore}>
        <Capsule x={ELBOW.x} y={ELBOW.y} length={FOREARM} width={9} opacity={opacity} />
      </g>
    </g>
  );

  return (
    <m.div
      className="absolute"
      style={{ left: PLAYER.left, top: PLAYER.top, width: PLAYER.width, height: PLAYER.width * 1.2 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.45, times: [0, 0.08, 0.72, 1], ease: "easeOut" }}
    >
      <svg viewBox="0 0 200 240" className="h-full w-full overflow-visible" aria-hidden="true">
        <g ref={body}>
          {/* far side first, lighter, for depth */}
          {leg(standThigh, standShin, 0.5)}
          <g ref={torso}>
            {arm(farArm, farFore, 0.5)}
            {/* torso tapers from shoulders to hips; the neck is the gap below the head */}
            <path d="M99 51 Q110 47 117 54 L106 117 Q98 121 90 116 Z" fill={FIGURE} />
            <circle cx={115} cy={33} r={12.5} fill={FIGURE} />
            {arm(nearArm, nearFore, 1)}
          </g>
          {leg(kickThigh, kickShin, 1)}
        </g>
        <g ref={ball}>
          <BallShape cx={BALL_SVG.x} cy={BALL_SVG.y} r={BALL_R} />
        </g>
      </svg>
    </m.div>
  );
}

/** A clean ball: white with ink panels. */
function BallShape({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const k = r / 100;
  const p = (x: number, y: number) => `${cx + x * k},${cy + y * k}`;
  const panel = (pts: [number, number][]) => <polygon points={pts.map(([x, y]) => p(x, y)).join(" ")} fill={INK} />;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={INK} strokeWidth={r * 0.06} />
      {panel([[0, -34], [32, -11], [20, 28], [-20, 28], [-32, -11]])}
      <path
        d={`M${p(0, -34)} L${p(0, -82)} M${p(32, -11)} L${p(78, -26)} M${p(20, 28)} L${p(48, 68)} M${p(-20, 28)} L${p(-48, 68)} M${p(-32, -11)} L${p(-78, -26)}`}
        stroke={INK}
        strokeWidth={r * 0.06}
      />
      {panel([[-14, -98], [14, -98], [0, -82]])}
      {panel([[92, -40], [98, -12], [78, -26]])}
      {panel([[-92, -40], [-98, -12], [-78, -26]])}
      {panel([[64, 76], [38, 92], [48, 68]])}
      {panel([[-64, 76], [-38, 92], [-48, 68]])}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Declarative tracks for the ball, disc, ring and emblem (absolute times, seconds).
// ---------------------------------------------------------------------------

type Key = [time: number, value: number];

function track(keys: Key[], ease: Easing | Easing[] = "easeInOut") {
  const t0 = keys[0][0];
  const span = keys[keys.length - 1][0] - t0 || 0.001;
  return {
    values: keys.map((k) => k[1]),
    transition: { delay: t0, duration: span, times: keys.map((k) => (k[0] - t0) / span), ease },
  };
}

function motionProps(props: Record<string, { keys: Key[]; ease?: Easing | Easing[] }>) {
  const initial: Record<string, number> = {};
  const animateTo: Record<string, number[]> = {};
  const transition: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(props)) {
    const t = track(spec.keys, spec.ease);
    initial[name] = t.values[0];
    animateTo[name] = t.values;
    transition[name] = t.transition;
  }
  return { initial, animate: animateTo, transition };
}

const centred = { left: LOGO_C.x - LOGO / 2, top: LOGO_C.y - LOGO / 2, width: LOGO, height: LOGO };

function FlyingBall({ trail }: { trail: number }) {
  const d = trail * 0.045;
  const peak = [1, 0.26, 0.15, 0.07][trail];
  const opacity: Key[] =
    trail === 0
      ? [[0, 0], [CONTACT - 0.01, 0], [CONTACT, 1], [1.56, 1], [1.58, 0]]
      : [[0, 0], [CONTACT + d, 0], [CONTACT + d + 0.05, peak], [ARRIVE - 0.12, peak], [ARRIVE - 0.02, 0]];
  const props = motionProps({
    x: { keys: [[CONTACT + d, BALL_START.x], [1.15 + d, -16], [ARRIVE + d, 0]], ease: ["easeOut", "easeInOut"] },
    y: { keys: [[CONTACT + d, BALL_START.y], [1.15 + d, 64], [ARRIVE + d, 0]], ease: ["easeOut", "easeInOut"] },
    scale: { keys: [[CONTACT + d, BALL_START.scale], [ARRIVE + d, 0.9]], ease: "easeIn" },
    rotate: { keys: [[CONTACT + d, 0], [ARRIVE + d, 760]], ease: "easeOut" },
    opacity: { keys: opacity, ease: "linear" },
  });
  return (
    <m.svg viewBox="-100 -100 200 200" className="absolute" style={centred} aria-hidden="true" {...props}>
      <BallShape cx={0} cy={0} r={98} />
    </m.svg>
  );
}

function Emblem({ exitTo, exiting }: { exitTo: { x: number; y: number; scale: number }; exiting: boolean }) {
  // The ball turns silver from the inside: an opaque disc grows from its centre until it
  // covers the ball, then dissolves into the emblem. No cross-fade, so no double exposure.
  const disc = motionProps({
    opacity: { keys: [[1.4, 0], [1.42, 1], [1.72, 1], [1.95, 0]], ease: "linear" },
    scale: { keys: [[1.4, 0.2], [1.55, 0.94], [1.72, 1]], ease: ["easeOut", "easeOut"] },
  });
  const ring = motionProps({
    opacity: { keys: [[1.58, 0], [1.68, 1], [2.05, 0]], ease: "easeOut" },
    scale: { keys: [[1.58, 0.96], [1.75, 1.04], [2.05, 1.1]], ease: "easeOut" },
  });
  const reveal = motionProps({
    opacity: { keys: [[1.66, 0], [1.82, 1]], ease: "easeOut" },
    scale: { keys: [[1.66, 0.94], [1.95, 1], [2.15, 1.025], [EXIT, 1]], ease: ["easeOut", "easeInOut", "easeInOut"] },
  });
  // Exit: a separate phase, started when the page is ready, flying into the header's 25 mark.
  const exitEase: Easing = [0.65, 0, 0.35, 1];
  const exit = {
    animate: { x: exitTo.x, y: exitTo.y, scale: exitTo.scale, opacity: [1, 1, 0] },
    transition: {
      x: { duration: EXIT_DURATION, ease: exitEase },
      y: { duration: EXIT_DURATION, ease: exitEase },
      scale: { duration: EXIT_DURATION, ease: exitEase },
      opacity: { duration: EXIT_DURATION, times: [0, 0.8, 1] },
    },
  };
  const shimmer = motionProps({
    x: { keys: [[1.95, -LOGO * 0.9], [2.38, LOGO * 0.9]], ease: "easeInOut" },
    opacity: { keys: [[1.95, 0], [2.0, 1], [2.33, 1], [2.38, 0]], ease: "linear" },
  });
  return (
    <>
      <m.div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{ ...centred, background: "radial-gradient(circle at 38% 32%, #ffffff 0%, #e8ecf0 45%, #c9cfd6 80%, #aab3bd 100%)" }}
        {...disc}
      />
      <m.div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{ ...centred, boxShadow: "inset 0 0 0 6px #d4d9df, inset 0 0 0 8px #8aa9b1, 0 0 26px rgb(138 169 177 / 0.5)" }}
        {...ring}
      />
      <m.div className="absolute" style={centred} {...(exiting ? { initial: reveal.initial, ...exit } : reveal)}>
        {/* the official Silver Jubilee logo (design/jubilee-logo.png via scripts/brand-assets.py), never recoloured */}
        <Image src={emblem} alt="" width={LOGO} height={LOGO} loading="eager" className="h-full w-full" />
        {/* The shimmer is masked by the logo's own shape, so it never crosses the transparent parts. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden"
          style={{ maskImage: `url(${emblemMask.src})`, maskSize: "100% 100%", WebkitMaskImage: `url(${emblemMask.src})`, WebkitMaskSize: "100% 100%" }}
        >
          <m.div
            className="absolute inset-y-0 w-1/2"
            style={{ left: LOGO / 4, background: "linear-gradient(105deg, transparent 0%, rgb(255 255 255 / 0.7) 50%, transparent 100%)" }}
            {...shimmer}
          />
        </div>
      </m.div>
    </>
  );
}

// ---------------------------------------------------------------------------

/**
 * `live` becomes true if the Live page reports a match in progress while this plays:
 * the intro then fades out at once, so the score is never held back.
 */
export function Intro({ onDone, live, ready }: { onDone: () => void; live: boolean; ready: boolean }) {
  const reduce = useReducedMotion();
  const [exitTo, setExitTo] = useState<{ x: number; y: number; scale: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [minReached, setMinReached] = useState(false);
  const [maxReached, setMaxReached] = useState(false);
  // The emblem leaves once the page's data has arrived (never later than EXIT + HOLD_MAX).
  const exiting = !reduce && minReached && (ready || maxReached);

  // Where the header's 25 mark is, relative to the emblem's resting place.
  useEffect(() => {
    const t = setTimeout(() => {
      const target = document.querySelector<HTMLElement>("[data-intro-target]")?.getBoundingClientRect();
      const cx = (window.innerWidth - STAGE_W) / 2 + LOGO_C.x;
      const cy = (window.innerHeight - STAGE_H) / 2 + LOGO_C.y;
      setExitTo(
        target
          ? { x: target.left + target.width / 2 - cx, y: target.top + target.height / 2 - cy, scale: target.width / LOGO }
          : { x: 0, y: -cy, scale: 0.2 },
      );
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // All timers start when the stage is ready (exitTo measured), together with its animations.
  useEffect(() => {
    if (!exitTo || reduce) return;
    const a = setTimeout(() => setMinReached(true), EXIT * 1000);
    const b = setTimeout(() => setMaxReached(true), (EXIT + HOLD_MAX) * 1000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [exitTo, reduce]);

  useEffect(() => {
    if (leaving) {
      const t = setTimeout(onDone, 300);
      return () => clearTimeout(t);
    }
    if (reduce) {
      const t = setTimeout(onDone, 1000);
      return () => clearTimeout(t);
    }
    if (exiting) {
      const t = setTimeout(onDone, EXIT_DURATION * 1000);
      return () => clearTimeout(t);
    }
  }, [onDone, leaving, reduce, exiting]);

  // A match went live while the intro was playing: get out of the way.
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => setLeaving(true), 0);
    return () => clearTimeout(t);
  }, [live]);

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        role="dialog"
        aria-label="Intro animation. Tap to skip."
        onClick={() => setLeaving(true)}
        className="fixed inset-0 z-[60] !m-0 cursor-pointer overflow-hidden"
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.28 }}
      >
        {/* only the background fades on exit; the emblem stays solid as it flies into the header */}
        <m.div
          className="absolute inset-0 bg-bg"
          initial={{ opacity: 1 }}
          animate={reduce ? { opacity: [1, 1, 0] } : { opacity: exiting ? 0 : 1 }}
          transition={reduce ? { duration: 1, times: [0, 0.7, 1] } : { duration: EXIT_DURATION * 0.85, ease: "easeOut" }}
        />
        <div
          className="absolute"
          style={{ left: "50%", top: "50%", width: STAGE_W, height: STAGE_H, marginLeft: -STAGE_W / 2, marginTop: -STAGE_H / 2 }}
        >
          {reduce ? (
            <m.div
              className="absolute overflow-hidden rounded-full"
              style={centred}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1, times: [0, 0.3, 0.7, 1] }}
            >
              <Image src={emblem} alt="" width={LOGO} height={LOGO} className="h-full w-full" />
            </m.div>
          ) : (
            exitTo && (
              <>
                <Footballer />
                <FlyingBall trail={3} />
                <FlyingBall trail={2} />
                <FlyingBall trail={1} />
                <FlyingBall trail={0} />
                <Emblem exitTo={exitTo} exiting={exiting} />
              </>
            )
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLeaving(true);
          }}
          className="absolute right-4 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] h-11 rounded-full px-4 text-sm font-semibold text-muted active:bg-card"
        >
          Skip
        </button>
      </m.div>
    </LazyMotion>
  );
}
