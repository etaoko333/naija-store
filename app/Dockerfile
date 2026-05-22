FROM node:20-alpine AS frontend-build

ARG VITE_COGNITO_USER_POOL_ID
ARG VITE_COGNITO_CLIENT_ID
ARG VITE_API_URL
ARG VITE_AWS_REGION=us-east-1

ENV VITE_COGNITO_USER_POOL_ID=$VITE_COGNITO_USER_POOL_ID \
    VITE_COGNITO_CLIENT_ID=$VITE_COGNITO_CLIENT_ID \
    VITE_API_URL=$VITE_API_URL \
    VITE_AWS_REGION=$VITE_AWS_REGION

WORKDIR /build

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY server/package.json ./server/
RUN cd server && npm install --only=production

COPY server/ ./server/
COPY --from=frontend-build /build/dist ./public

RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server/index.js"]
