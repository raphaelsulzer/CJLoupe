# Installation on WSL Ubuntu

Steps to get CJLoupe running in a WSL Ubuntu environment.

## Prerequisites

WSL Ubuntu does not ship with Node.js, Bun, or `unzip`. This guide installs everything in user space — no `sudo` required after the initial `unzip` install.

### 1. Install `unzip` (requires sudo, one-time)

```bash
sudo apt-get update && sudo apt-get install -y unzip
```

If you do not have sudo access, skip this step and use the npm-based Bun install in step 3 instead.

### 2. Install Node.js via nvm

[nvm](https://github.com/nvm-sh/nvm) installs Node.js entirely in your home directory — no sudo needed.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Reload your shell (or open a new terminal), then install the LTS release:

```bash
export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh"
nvm install --lts
```

nvm appends itself to `~/.bashrc`, so `node` and `npm` will be available in all future terminals automatically.

### 3. Install Bun

**With `unzip` available (preferred):**

```bash
curl -fsSL https://bun.sh/install | bash
```

**Without `unzip` (fallback via npm):**

```bash
npm install -g bun
```

Verify:

```bash
bun --version
```

### 4. Clone the repository

```bash
git clone https://github.com/your-org/CJLoupe.git
cd CJLoupe
```

### 5. Install dependencies

```bash
bun install
```

## Running the dev server

```bash
bun dev
```

The terminal will print:

```
VITE v8.x.x  ready in ~200 ms

  ➜  Local:   http://localhost:5173/
```

Open `http://localhost:5173` in your Windows browser. WSL forwards `localhost` to Windows automatically — no extra configuration needed.

## Other useful commands

```bash
bun run build    # production build → dist/
bun run preview  # serve the production build locally
bun run lint     # run ESLint
```

## Troubleshooting

**`bun` not found after install**
The installer appends to `~/.bashrc`. Either open a new terminal or run:
```bash
source ~/.bashrc
```

**Port 5173 already in use**
Kill the existing process:
```bash
pkill -f vite
```

**`node` not found in a new terminal**
nvm is sourced from `~/.bashrc`. If you use `zsh`, add the nvm lines to `~/.zshrc` as well:
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```
