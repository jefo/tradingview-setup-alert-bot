Vagrant.configure("2") do |config|
  # Provider configuration
  config.vm.provider :libvirt do |libvirt|
      libvirt.driver = "kvm"
      libvirt.memory = "4096"
      libvirt.cpus = "4"
  end

  # Base box configuration
  config.vm.box = "generic/ubuntu2204"  # Using a well-known box
  
  # Network configuration
  config.vm.network "private_network", ip: "192.168.0.13"
  config.vm.network "forwarded_port", guest: 6390, host: 6390
  config.vm.network "forwarded_port", guest: 27017, host: 27017
  config.vm.network "forwarded_port", guest: 8081, host: 8081

  # Folder sync configuration
  config.vm.synced_folder ".", "/home/vagrant/app", type: "nfs", nfs_udp: false

  # Required plugins
  config.vagrant.plugins = ["vagrant-docker-compose"]
  
  # Base system setup
  config.vm.provision "shell", inline: <<-SHELL 
      apt-get update -y
      apt-get install -y unzip

      # Install Node.js 20.x
      cd /home/vagrant
      curl -sL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh
      bash nodesource_setup.sh
      apt-get install -y nodejs
  SHELL

  # User-specific installations
  config.vm.provision "shell", inline: <<-SCRIPT, privileged: false
      # Install Bun
      curl -fsSL https://bun.sh/install | bash
      source /home/vagrant/.bashrc

      # Install Moon
      export MOON_INSTALL_DIR=/home/vagrant/.moon/bin
      curl -fsSL https://moonrepo.dev/install/moon.sh | bash
  SCRIPT

  # Database setup
  config.vm.provision :docker
  config.vm.provision :docker_compose, yml: "/home/vagrant/app/docker-compose.yml", rebuild: true, run: "always"
end
