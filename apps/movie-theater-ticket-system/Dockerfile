# Multi-stage build for the Movie Theater Ticket System.
# Build context: this folder (the app can live in a subfolder of a larger repo).
#
#   docker build -t movie-theater-ticket-system .
#   docker run --rm -p 8080:8080 -e DemoAdmin__Password=choose-a-password movie-theater-ticket-system
#
# Image tags are pinned to exact versions that match the versions this project was tested with
# (.NET SDK 10.0.404, ASP.NET Core runtime 10.0.15, Node.js 26.13.0).

# ---- 1. Build the React client ----
FROM node:26.13.0-bookworm-slim AS client
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# vite.config.ts writes the build to ../src/MovieTheater.Api/wwwroot
RUN npm run build

# ---- 2. Publish the ASP.NET Core app ----
FROM mcr.microsoft.com/dotnet/sdk:10.0.404-noble AS api
WORKDIR /src
COPY nuget.config global.json ./
COPY src/MovieTheater.Api/MovieTheater.Api.csproj src/MovieTheater.Api/
RUN dotnet restore src/MovieTheater.Api/MovieTheater.Api.csproj
COPY src/ src/
COPY --from=client /src/src/MovieTheater.Api/wwwroot src/MovieTheater.Api/wwwroot
RUN dotnet publish src/MovieTheater.Api/MovieTheater.Api.csproj -c Release -o /app/publish --no-restore -p:SkipClientBuild=true

# ---- 3. Runtime image ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0.15-noble AS runtime
WORKDIR /app
COPY --from=api /app/publish ./

# The SQLite file and data protection keys go in App_Data. Most free hosts give containers a
# temporary disk, so this data is recreated (fresh sample data) every time the container starts.
RUN mkdir -p /app/App_Data && chown "$APP_UID" /app/App_Data
USER $APP_UID

ENV ASPNETCORE_ENVIRONMENT=Production
# The base image listens on 8080 (ASPNETCORE_HTTP_PORTS). If the host sets PORT, the app uses that instead.
EXPOSE 8080

# Admin sign-in stays disabled until DemoAdmin__Password is provided at run time. Never bake a
# password into the image.
ENTRYPOINT ["dotnet", "MovieTheater.Api.dll"]
