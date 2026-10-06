import Image from "next/image";
import logo from "@/assets/header-logo.webp";

/**
 * The official Silver Jubilee logo on a white plate, so its teal ring and lettering stay visible
 * on the teal fan header and the ink admin header alike. The logo is 90% of the plate: its ribbon
 * tips reach 1.08x the emblem's circle, so this keeps them inside the plate. The 160 px file is
 * served as is (unoptimized): Next's fixed-size srcset stops at 2x, which is soft on 3x phones.
 */
export function JubileeLogo({ size = 40, introTarget = false }: { size?: number; introTarget?: boolean }) {
  const inner = Math.floor(size * 0.9);
  return (
    <span
      data-intro-target={introTarget || undefined}
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-logo-plate shadow-[0_0_0_2px_rgb(255_255_255/0.25)]"
    >
      <Image src={logo} alt="" width={inner} height={inner} unoptimized loading="eager" style={{ width: inner, height: inner }} />
    </span>
  );
}
