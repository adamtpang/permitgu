const guides = [
  "about",
  "ask",
  "build",
  "clear-grade",
  "corrections",
  "events",
  "food-truck",
  "help",
  "how-it-works",
  "privacy",
  "public-spaces",
  "roadmap",
  "typhoon-repair",
  "zoning",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/index.html" }],
      afterFiles: guides.map((slug) => ({ source: `/${slug}`, destination: `/${slug}.html` })),
    };
  },
};

export default nextConfig;
