// A minimal stand-in for a real tailwind.config.js -- full module.exports shape (theme + content),
// to prove windtailor can load a real project config file directly, not just a bare theme object.
module.exports = {
  content: ["./src/**/*.html"],
  theme: {
    extend: {
      colors: {
        "brand-ink": "#111827",
        "brand-blue": "#3a81f5",
      },
      borderRadius: {
        pill: "33px",
      },
    },
  },
};
