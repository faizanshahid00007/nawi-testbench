# Free hosting without a card: Hugging Face Spaces

1. Create an account at https://huggingface.co (email only, no card).
2. Go to https://huggingface.co/new-space. Name it `nawi-testbench`, choose **Docker** as the SDK, template **Blank**, visibility **Public**, hardware **CPU basic (free)**. Click Create.
3. On the new Space, open **Files** and click **Add file → Create a new file**. Name it `Dockerfile` and paste exactly:

```
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git chromium fonts-liberation && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/faizanshahid00007/nawi-testbench /app
WORKDIR /app
RUN npm ci --omit=dev && mkdir -p /data && chmod 777 /data
ENV CHROME_PATH=/usr/bin/chromium PORT=7860 NAWI_DB=/data/nawi.db
EXPOSE 7860
CMD ["sh", "-c", "node src/seed.js; node src/server.js"]
```

4. Click **Commit new file to main**. The Space builds for two to three minutes, then the app appears at
   `https://<your-username>-nawi-testbench.hf.space` (also embedded on the Space page).
5. Sign in at `/login` with the demo accounts and change the passwords under Users.

To pick up new commits from GitHub, open the Space settings and click **Factory reboot**, or edit the Dockerfile and commit again.

Notes: the free Space sleeps after 48 hours without visitors and wakes on the next visit; the database resets when the Space rebuilds, and the seed recreates the two worked examples each time.
