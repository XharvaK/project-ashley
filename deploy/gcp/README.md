# Ashley on Google Cloud (Compute Engine)

Discord bot **7/24 açık kalmalı** — Cloud Run / serverless uygun değil (WebSocket kesilir).  
**Compute Engine** (küçük VM) doğru seçenek. Arayüz: [Google Cloud Console](https://console.cloud.google.com).

## Ne cloud’a gider, ne PC’de kalır?

| Bileşen | Cloud VM | Senin PC |
|---------|----------|----------|
| agent-service | ✅ | opsiyonel (voice için) |
| discord-bot | ✅ | ❌ |
| voice-service | ❌ | ✅ |
| Orpheus TTS | ❌ | ✅ (GPU) |
| desktop avatar | ❌ | ✅ |

Cursor kapalıyken **Discord Ashley** cloud’da çalışır. **Sesli Ashley** yalnızca PC’de stack açıkken.

## Maliyet (kabaca)

- **e2-small** (2 vCPU, 2 GB): ~12–15 USD/ay — kredinle karşılanır
- **e2-micro**: daha ucuz; yoğun memory job’da sıkışabilir
- Firewall: **3710’u internete açma** — sadece Docker iç ağı

## Kurulum özeti

### 1. VM oluştur (Console)

1. Compute Engine → VM instances → Create
2. Region: `europe-west3` (Frankfurt) veya sana yakın
3. Machine: **e2-small**, boot disk **Debian 12** 20 GB
4. Firewall: sadece SSH (22) — HTTP/HTTPS işaretleme
5. Create

### 2. Repo + env

SSH ile bağlan:

```bash
sudo apt update && sudo apt install -y git
sudo git clone https://github.com/XharvaK/composer-assistant.git /opt/composer-assistant
cd /opt/composer-assistant/deploy/gcp
cp .env.example .env
nano .env   # MISTRAL_API_KEY, DISCORD_BOT_TOKEN, DISCORD_OWNER_ID
```

### 3. Hafıza taşıma (isteğe bağlı)

Mevcut SQLite’ı PC’den VM’e:

```powershell
# PC (PowerShell) — VM IP'ni değiştir
scp $env:USERPROFILE\.composer-assistant\conversations\index.db USER@VM_IP:/tmp/
```

VM’de:

```bash
sudo mkdir -p /var/lib/docker/volumes/deploy_gcp_ashley-data/_data/conversations
# veya stack ilk çalıştıktan sonra volume path'i docker volume inspect ile bul
```

İlk kurulumda boş DB de olur; `/new` ile temiz başlanır.

### 4. Başlat

```bash
cd /opt/composer-assistant
sudo bash deploy/gcp/bootstrap.sh
```

Log:

```bash
cd /opt/composer-assistant/deploy/gcp
docker compose logs -f discord-bot
```

`logged in as Ashley#...` görmelisin.

### 5. Güncelleme

```bash
cd /opt/composer-assistant
sudo git pull
cd deploy/gcp
docker compose build
docker compose up -d
```

## PC’de script zorunlu mu?

Hayır — üç seçenek:

1. **GCP VM** (önerilen Discord için) — Cursor kapalı olsa da çalışır
2. **Windows Görev Zamanlayıcı** — oturum açılınca `scripts/start-production.ps1` (yerel)
3. **Manuel** `npm run dev:discord` — sadece geliştirme

## Güvenlik

- API anahtarları yalnızca `deploy/gcp/.env` (VM’de), repoya commit etme
- `agent-service` dışarıdan erişilemez; bot aynı Docker ağında `http://agent:3710` kullanır
- Debug endpoint’ler yine localhost kısıtlı

## Cloud Run / App Engine?

Discord gateway **sürekli bağlantı** ister → **kullanma**. Compute Engine veya bare-metal VPS.
