#!/bin/bash

# Обновление пакетов и установка зависимостей
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y wget curl software-properties-common

# Установка Docker
sudo apt-get remove -y docker docker-engine docker.io containerd runc
sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# Запуск и добавление Docker в автозагрузку
sudo systemctl enable docker
sudo systemctl start docker

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Проверка установки Docker и Docker Compose
docker --version
docker-compose --version

# Установка PM2
sudo npm install -g pm2

# Запуск и добавление PM2 в автозагрузку
pm2 startup ubuntu
sudo env PATH=$PATH:/usr/bin pm2 startup ubuntu -u $USER --hp $HOME

# Проверка установки PM2
pm2 --version

# Установка и настройка UFW (Uncomplicated Firewall)
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
echo "y" | sudo ufw enable

# Проверка статуса UFW
sudo ufw status

echo "Provisioning complete!"