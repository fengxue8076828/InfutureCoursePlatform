import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#18212f",
        mist: "#f6fbfb",
        coral: "#ff6f61",
        mint: "#49c5a7",
        skysoft: "#8fd3ff",
        sunshine: "#ffd166"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(29, 55, 83, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
