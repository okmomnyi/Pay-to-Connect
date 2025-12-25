# MikroTik Hotspot Configuration for Pay-to-Connect System
# This script sets up a complete hotspot configuration with RADIUS authentication

# ============================================================================
# BASIC CONFIGURATION
# ============================================================================

# Set system identity
/system identity set name="PayToConnect-Gateway"

# Configure DNS servers
/ip dns set servers=8.8.8.8,1.1.1.1 allow-remote-requests=yes

# ============================================================================
# INTERFACE CONFIGURATION
# ============================================================================

# Configure WAN interface (adjust interface name as needed)
/ip address add address=dhcp-client interface=ether1 comment="WAN Interface"
/ip dhcp-client add interface=ether1 disabled=no comment="WAN DHCP Client"

# Configure LAN interface for hotspot
/ip address add address=192.168.100.1/24 interface=ether2 comment="Hotspot LAN"

# ============================================================================
# DHCP SERVER CONFIGURATION
# ============================================================================

# Create DHCP pool
/ip pool add name=hotspot-pool ranges=192.168.100.10-192.168.100.200

# Configure DHCP server
/ip dhcp-server network add address=192.168.100.0/24 gateway=192.168.100.1 dns-server=192.168.100.1
/ip dhcp-server add name=hotspot-dhcp interface=ether2 address-pool=hotspot-pool disabled=no

# ============================================================================
# FIREWALL CONFIGURATION
# ============================================================================

# NAT rule for internet access
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="Hotspot NAT"

# Allow established and related connections
/ip firewall filter add chain=forward connection-state=established,related action=accept comment="Allow established/related"

# Allow hotspot traffic
/ip firewall filter add chain=forward in-interface=ether2 action=accept comment="Allow hotspot traffic"

# Drop invalid connections
/ip firewall filter add chain=forward connection-state=invalid action=drop comment="Drop invalid"

# Allow ICMP
/ip firewall filter add chain=input protocol=icmp action=accept comment="Allow ICMP"

# Allow established connections to router
/ip firewall filter add chain=input connection-state=established,related action=accept comment="Allow established to router"

# Allow access to router from LAN
/ip firewall filter add chain=input src-address=192.168.100.0/24 action=accept comment="Allow LAN to router"

# Allow RADIUS traffic
/ip firewall filter add chain=input protocol=udp dst-port=1812 action=accept comment="Allow RADIUS Auth"
/ip firewall filter add chain=input protocol=udp dst-port=1813 action=accept comment="Allow RADIUS Accounting"

# Allow SSH (change port for security)
/ip firewall filter add chain=input protocol=tcp dst-port=22 src-address=192.168.100.0/24 action=accept comment="Allow SSH from LAN"

# Allow Winbox
/ip firewall filter add chain=input protocol=tcp dst-port=8291 src-address=192.168.100.0/24 action=accept comment="Allow Winbox from LAN"

# Allow web interface
/ip firewall filter add chain=input protocol=tcp dst-port=80 src-address=192.168.100.0/24 action=accept comment="Allow HTTP from LAN"

# Drop everything else
/ip firewall filter add chain=input action=drop comment="Drop all other input"

# ============================================================================
# RADIUS CONFIGURATION
# ============================================================================

# Configure RADIUS server (replace with your server IP and secret)
/radius add service=hotspot address=YOUR_RADIUS_SERVER_IP secret="YOUR_RADIUS_SECRET" timeout=3s

# ============================================================================
# HOTSPOT CONFIGURATION
# ============================================================================

# Create hotspot server profile
/ip hotspot profile add name=pay-to-connect-profile \
    hotspot-address=192.168.100.1 \
    dns-name=portal.local \
    html-directory=pay-to-connect \
    http-proxy=0.0.0.0:0 \
    login-by=mac,http-chap \
    use-radius=yes \
    nas-identifier=PayToConnect-Gateway \
    radius-accounting=yes \
    radius-interim-update=5m

# Create hotspot server
/ip hotspot add name=pay-to-connect \
    interface=ether2 \
    address-pool=hotspot-pool \
    profile=pay-to-connect-profile \
    disabled=no

# ============================================================================
# WALLED GARDEN CONFIGURATION
# ============================================================================

# Allow access to captive portal
/ip hotspot walled-garden add dst-host=portal.local comment="Captive Portal"
/ip hotspot walled-garden add dst-host=*.portal.local comment="Captive Portal Subdomains"

# Allow access to payment gateway
/ip hotspot walled-garden add dst-host=*.safaricom.co.ke comment="M-Pesa Gateway"
/ip hotspot walled-garden add dst-host=api.safaricom.co.ke comment="M-Pesa API"
/ip hotspot walled-garden add dst-host=sandbox.safaricom.co.ke comment="M-Pesa Sandbox"

# Allow DNS resolution
/ip hotspot walled-garden add dst-port=53 protocol=udp comment="Allow DNS UDP"
/ip hotspot walled-garden add dst-port=53 protocol=tcp comment="Allow DNS TCP"

# Allow NTP for time synchronization
/ip hotspot walled-garden add dst-port=123 protocol=udp comment="Allow NTP"

# Allow captive portal detection
/ip hotspot walled-garden add dst-host=connectivitycheck.gstatic.com comment="Android connectivity check"
/ip hotspot walled-garden add dst-host=www.msftconnecttest.com comment="Windows connectivity check"
/ip hotspot walled-garden add dst-host=captive.apple.com comment="Apple connectivity check"
/ip hotspot walled-garden add dst-host=*.apple.com comment="Apple services"

# ============================================================================
# HOTSPOT USER PROFILES
# ============================================================================

# Default user profile for authenticated users
/ip hotspot user profile add name=authenticated \
    shared-users=1 \
    rate-limit=10M/10M \
    session-timeout=1h \
    idle-timeout=15m \
    keepalive-timeout=2m \
    status-autorefresh=1m \
    transparent-proxy=no

# ============================================================================
# SYSTEM CONFIGURATION
# ============================================================================

# Configure NTP client
/system ntp client set enabled=yes primary-ntp=pool.ntp.org secondary-ntp=time.google.com

# Configure logging
/system logging add topics=hotspot,radius,info action=memory
/system logging add topics=hotspot,radius,error action=memory

# ============================================================================
# SECURITY HARDENING
# ============================================================================

# Disable unnecessary services
/ip service disable telnet,ftp,www-ssl
/ip service set ssh port=2222
/ip service set winbox port=8291 address=192.168.100.0/24
/ip service set www port=80 address=192.168.100.0/24

# Configure secure passwords (change these!)
/user set admin password="CHANGE_THIS_ADMIN_PASSWORD"

# Create limited user for monitoring
/user add name=monitor password="CHANGE_THIS_MONITOR_PASSWORD" group=read comment="Monitoring user"

# ============================================================================
# BANDWIDTH MANAGEMENT (OPTIONAL)
# ============================================================================

# Create queue tree for bandwidth management
/queue tree add name=hotspot-download parent=ether2 max-limit=100M
/queue tree add name=hotspot-upload parent=ether2 max-limit=50M

# Simple queue for default users
/queue simple add name=default-user target=192.168.100.0/24 max-limit=2M/1M burst-limit=4M/2M

# ============================================================================
# MONITORING AND MAINTENANCE
# ============================================================================

# Enable SNMP for monitoring (optional)
/snmp set enabled=yes contact="admin@yourdomain.com" location="Your Location"

# Configure backup script (runs daily)
/system scheduler add name=daily-backup interval=1d start-time=03:00:00 \
    on-event="/system backup save name=auto-backup; /export file=auto-config"

# ============================================================================
# FINAL NOTES
# ============================================================================

# 1. Replace YOUR_RADIUS_SERVER_IP with your actual server IP
# 2. Replace YOUR_RADIUS_SECRET with your actual RADIUS shared secret
# 3. Change all default passwords
# 4. Adjust interface names (ether1, ether2) according to your setup
# 5. Customize IP ranges if needed
# 6. Add SSL certificate for HTTPS hotspot (recommended)
# 7. Configure proper DNS names for your domain

:log info "Pay-to-Connect hotspot configuration completed"
