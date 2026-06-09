import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { ink: "#1f2933", accent: "#2f6f5e", warn: "#b45309" },
    },
  },
  plugins: [],
};
export default config;
