import Image from "next/image";
import logo from "@/assets/intro-emblem.webp";

/**
 * The official Silver Jubilee logo on a white plate, so its teal ring and lettering stay visible
 * on the teal fan header and the ink admin header alike.
 */
export function JubileeLogo({ size = 40, introTarget = false }: { size?: number; introTarget?: boolean }) {
  const inner = size - 4;
  return (
    <span
      data-intro-target={introTarget || undefined}
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-logo-plate shadow-[0_0_0_2px_rgb(255_255_255/0.25)]"
    >
      <Image src={logo} alt="" width={inner} height={inner} loading="eager" style={{ width: inner, height: inner }} />
    </span>
  );
}
