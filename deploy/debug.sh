#!/bin/bash

# Проверка привилегий
if [[ $EUID -ne 0 ]]; then
   echo "Этот скрипт должен быть запущен от имени root." 
   exit 1
fi

# Включение отладочного режима для xl2tpd
sudo tee -a /etc/xl2tpd/xl2tpd.conf > /dev/null <<EOF
[global]
port = 1701
debug tunnel = yes

[lns default]
ip range = 10.0.0.2-10.0.0.10
local ip = 10.0.0.1
require chap = yes
refuse pap = yes
require authentication = yes
name = L2TP-VPN
ppp debug = yes
pppoptfile = /etc/ppp/options.xl2tpd
length bit = yes
EOF

# Перезапуск службы xl2tpd
systemctl restart xl2tpd
systemctl status xl2tpd

# Включение отладочного режима для strongswan
sudo tee -a /etc/strongswan/strongswan.d/charon.conf > /dev/null <<EOF
charon {
    filelog {
        /var/log/charon.log {
            default = 2
            ike = 2
            knl = 2
            net = 2
            cfg = 2
            dmn = 2
            108 = 2 # Ваша версия IKE, обычно 108 для IKEv2
        }
    }
}
EOF

# Перезапуск службы strongswan
systemctl restart strongswan
systemctl status strongswan

echo "Отладочные режимы включены, журналы могут быть найдены в /var/log/charon.log и в системных журналах."

# Проверка наличия ppp модулей
lsmod | grep ppp

if [[ $? -ne 0 ]]; then
    echo "Загрузка необходимых ppp модулей..."
    modprobe ppp_generic
    modprobe pppol2tp
fi

# Убедитесь, что xl2tpd и strongswan запущены
echo "Проверка статусов служб strongswan и xl2tpd..."
systemctl status strongswan
systemctl status xl2tpd

# Установка VPN соединения
echo "c myvpn" | sudo tee /var/run/xl2tpd/l2tp-control

# Дать соединению время для установления
sleep 5

# Проверка сетевых интерфейсов
echo "Проверка сетевых интерфейсов..."
ip link

# Проверка статуса IPsec
echo "Проверка статуса IPsec..."
sudo ipsec statusall
