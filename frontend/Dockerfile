FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV VITE_API_URL=/api/v1 VITE_USE_MOCK_API=false
ARG FRONTEND_BUILD_MODE=production
RUN npm run build -- --mode "$FRONTEND_BUILD_MODE"
RUN if [ "$FRONTEND_BUILD_MODE" != "demo" ]; then npm run check:production; fi

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
