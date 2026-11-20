#!/usr/bin/env bash
set -euo pipefail

# Credentials are provided by the operator, never stored in the repository.
: "${VPN_SERVER:?Set VPN_SERVER}"
: "${VPN_USERNAME:?Set VPN_USERNAME}"
: "${VPN_PASSWORD:?Set VPN_PASSWORD}"
: "${VPN_SUBNET:?Set VPN_SUBNET}"

export VPN_SERVER VPN_USERNAME VPN_PASSWORD VPN_SUBNET

# Шаг 1: Создание конфигурации VPN
VPN_CONFIG="/etc/ppp/peers/vpn_connection"
echo "Создаю конфигурацию в $VPN_CONFIG..."

sudo bash -c "cat > $VPN_CONFIG" <<EOL
pty "pptp $VPN_SERVER --nolaunchpppd"
lock
noauth
nobsdcomp
nodeflate
name $VPN_USERNAME
remotename PPTP
require-mppe-128
file /etc/ppp/options.pptp
ipparam vpn_connection
EOL

echo "Конфигурация создана."

# Шаг 2: Настройка аутентификации
CHAP_SECRETS="/etc/ppp/chap-secrets"
echo "Добавляю учетные данные в $CHAP_SECRETS..."

sudo bash -c "echo \"$VPN_USERNAME PPTP $VPN_PASSWORD *\" >> $CHAP_SECRETS"

echo "Учетные данные добавлены."

# Шаг 3: Настройка маршрутов
IP_UP_SCRIPT="/etc/ppp/ip-up"
echo "Создаю файл маршрутов $IP_UP_SCRIPT..."

sudo bash -c "cat > $IP_UP_SCRIPT" <<EOL
#!/bin/sh
/sbin/ip route add $VPN_SUBNET dev ppp0
/sbin/ip route add default dev ppp0
EOL

# Делаем скрипт исполняемым
sudo chmod +x $IP_UP_SCRIPT

echo "Маршруты настроены."

echo "Настройка завершена. Для подключения используйте команду: sudo pppd call vpn_connection"
