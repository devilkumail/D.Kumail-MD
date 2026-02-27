FROM node:22-alpine
RUN apk add --no-cache \
    git \
    ffmpeg \
    libwebp-tools \
    python3 \
    make \
    g++
WORKDIR /dkml
COPY package.json .
RUN npm install -g --force yarn pm2
RUN yarn install
COPY . .
RUN mkdir -p temp
ENV TZ=Asia/Kolkata
CMD ["npm", "start"]
