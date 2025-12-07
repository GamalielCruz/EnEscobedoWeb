import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./sanity/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
        colors: {
            primary: "#1DA1F2",
            secondary: "#14171A",
            accent: "#657786",
        },
        fontFamily: {
            sans: ["Inter", "sans-serif"], 
        },
        animation: {
            'infinite-scroll': 'infinite-scroll 25s linear infinite',
        },
        keyframes: {
            'infinite-scroll': {
            from: { transform: 'translateX(0)' },
            to: { transform: 'translateX(-100%)' },
            }
        }
        },
    },
    plugins: [animate, typography],
    };
export default config;

