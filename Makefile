.PHONY: backend frontend check integration assets

backend:
	cd backend && go run ./cmd/server

frontend:
	cd frontend && pnpm dev:h5

check:
	cd backend && go test ./... && go vet ./...
	cd frontend && pnpm typecheck && pnpm test && pnpm check:weapp && pnpm build:h5

integration:
	cd backend && INTEGRATION=1 go test -race ./...

assets:
	cd frontend && node scripts/assets.mjs
