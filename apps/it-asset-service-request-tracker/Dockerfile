# Multi-stage build for the IT Asset & Service Request Tracker.
# Build context is this folder (the app folder), so it works whether the folder is a repo root
# or a subfolder such as apps/it-asset-service-request-tracker/ inside a larger repo:
#   docker build -t it-asset-tracker .
#   docker build -t it-asset-tracker apps/it-asset-service-request-tracker      (from the larger repo's root)

# 1) Build the React client. Vite writes the output into src/ItAssetTracker.Api/wwwroot.
FROM node:26.13.0-bookworm-slim AS client
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2) Restore and publish the ASP.NET Core API together with the built client.
FROM mcr.microsoft.com/dotnet/sdk:10.0.404 AS build
WORKDIR /src
COPY nuget.config ./
COPY src/ItAssetTracker.Api/ItAssetTracker.Api.csproj src/ItAssetTracker.Api/
RUN dotnet restore src/ItAssetTracker.Api/ItAssetTracker.Api.csproj
COPY src/ItAssetTracker.Api/ src/ItAssetTracker.Api/
COPY --from=client /src/src/ItAssetTracker.Api/wwwroot/ src/ItAssetTracker.Api/wwwroot/
RUN dotnet publish src/ItAssetTracker.Api/ItAssetTracker.Api.csproj -c Release -o /app/publish --no-restore -p:UseAppHost=false

# 3) Small runtime image. Runs as the non-root "app" user that the official image provides (APP_UID).
FROM mcr.microsoft.com/dotnet/aspnet:10.0.15 AS final
WORKDIR /app
COPY --from=build /app/publish ./
# The SQLite file lives in App_Data. Without a mounted volume it is lost when the container is
# replaced, and the app recreates and reseeds it on the next start.
RUN mkdir -p /app/App_Data && chown "$APP_UID" /app/App_Data
USER $APP_UID
ENV ASPNETCORE_ENVIRONMENT=Production
# The base image listens on 8080 (ASPNETCORE_HTTP_PORTS). A PORT variable set by the host overrides it.
EXPOSE 8080
ENTRYPOINT ["dotnet", "ItAssetTracker.Api.dll"]
