import type { ExperienceId } from "../types";

export const experiences: Record<
  ExperienceId,
  { name: string; copy: string; warning?: string }
> = {
  standard: {
    name: "Standard 2D",
    copy: "Crystal-clear projection and comfortable seating.",
  },
  "3d": {
    name: "RealD 3D",
    copy: "Immersive depth with lightweight 3D glasses.",
  },
  imax: { name: "IMAX", copy: "Floor-to-ceiling picture and precision sound." },
  dolby: {
    name: "Dolby Cinema",
    copy: "Dolby Vision, Atmos and luxury recliners.",
  },
  "4dx": {
    name: "4DX",
    copy: "Motion seats with wind, water and environmental effects.",
    warning:
      "Includes motion, water and flashing effects. Not recommended during pregnancy or for some medical conditions; height restrictions apply.",
  },
  screenx: {
    name: "ScreenX",
    copy: "A panoramic 270-degree cinema experience.",
  },
};
