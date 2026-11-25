declare module "@/components/Grainient.jsx" {
  import type { ComponentType, CSSProperties, HTMLAttributes } from "react";

  interface GrainientProps extends HTMLAttributes<HTMLDivElement> {
    colors?: string[];
    type?: "linear" | "radial";
    angle?: number;
    bands?: number;
    speed?: number;
    flow?: number;
    scale?: number;
    softness?: number;
    silk?: number;
    grainAmount?: number;
    grainSize?: number;
    grainAnimated?: boolean;
    contrast?: number;
    saturation?: number;
    variation?: number;
    interactive?: boolean;
    stir?: number;
    clickSwirl?: boolean;
    intro?: boolean;
    lightMode?: boolean;
    dpr?: number;
    className?: string;
    style?: CSSProperties;
  }
  const Grainient: ComponentType<GrainientProps>;
  export default Grainient;
}

declare module "@/components/FlipCard.jsx" {
  import type { ComponentType, ReactNode } from "react";

  interface FlipCardProps {
    front?: ReactNode;
    back?: ReactNode;
    flipped?: boolean;
    defaultFlipped?: boolean;
    onFlipChange?: (flipped: boolean) => void;
    axis?: "x" | "y";
    flipOnClick?: boolean;
    draggable?: boolean;
    dragDistance?: number;
    tilt?: boolean;
    tiltMax?: number;
    glare?: boolean;
    glareOpacity?: number;
    hoverScale?: number;
    perspective?: number;
    stiffness?: number;
    damping?: number;
    width?: number;
    height?: number;
    radius?: number;
    background?: string;
    color?: string;
    shadow?: boolean;
    shadowColor?: string;
    shadowOpacity?: number;
    disabled?: boolean;
    ariaLabel?: string;
    className?: string;
  }
  const FlipCard: ComponentType<FlipCardProps>;
  export default FlipCard;
}
