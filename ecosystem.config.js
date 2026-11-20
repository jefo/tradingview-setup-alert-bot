module.exports = {
  apps: [
    {
      name: "api",
      script: "./build/api",
      // interpreter: "bun",
      env: {
        PORT: 80,
      },
    },
    {
      name: "bot",
      script: "./build/bot",
      // interpreter: "bun",
      env: {
        REDIS_URL: "redis://0.0.0.0:6379/",
      },
    },
  ],
};
