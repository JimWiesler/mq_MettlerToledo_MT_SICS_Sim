FROM node:latest

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to workdir, then install package dependencies
COPY mt-sics-sim/package*.json ./
RUN npm install

# Copy app file to working directory
COPY mt-sics-sim/index.js ./

CMD ["node", "index.js"]
