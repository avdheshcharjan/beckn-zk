FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/ledger ./cmd/ledger

FROM alpine:3.20
COPY --from=build /out/ledger /usr/local/bin/ledger
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/ledger"]
