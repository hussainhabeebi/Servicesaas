FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY apps/admin/package.json apps/admin/package.json
RUN corepack prepare pnpm@9.7.0 --activate && pnpm install --filter @serviceos/admin... --frozen-lockfile=false
COPY apps/admin apps/admin
ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE
RUN pnpm --filter @serviceos/admin build

FROM nginx:1.27-alpine
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
