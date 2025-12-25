# Multi-Router Setup for Pay-to-Connect System
# Configuration for deploying multiple MikroTik routers in an estate

# ============================================================================
# ROUTER IDENTIFICATION SETUP
# ============================================================================

# Set unique router identity (change for each router)
/system identity set name="PayToConnect-Router-01"

# Set unique NAS-Identifier for RADIUS (change for each router)
:local nasId "Estate-Router-01"

# Set unique IP ranges for each router to avoid conflicts
:local routerSubnet "192.168.101.0/24"
:local routerGateway "192.168.101.1"
:local dhcpRange "192.168.101.10-192.168.101.200"

# ============================================================================
# NETWORK CONFIGURATION
# ============================================================================

# Configure LAN interface with unique subnet
/ip address add address=$routerGateway interface=ether2 comment="Hotspot LAN - Router 01"

# Create DHCP pool with unique range
/ip pool add name=hotspot-pool-01 ranges=$dhcpRange

# Configure DHCP server
/ip dhcp-server network add address=$routerSubnet gateway=$routerGateway dns-server=$routerGateway
/ip dhcp-server add name=hotspot-dhcp-01 interface=ether2 address-pool=hotspot-pool-01 disabled=no

# ============================================================================
# CENTRALIZED RADIUS CONFIGURATION
# ============================================================================

# Configure connection to centralized RADIUS server
/radius add service=hotspot \
    address=YOUR_CENTRAL_RADIUS_SERVER_IP \
    secret="YOUR_SHARED_RADIUS_SECRET" \
    authentication-port=1812 \
    accounting-port=1813 \
    timeout=5s \
    tries=3 \
    comment="Central Pay-to-Connect RADIUS"

# ============================================================================
# HOTSPOT PROFILE FOR MULTI-ROUTER
# ============================================================================

/ip hotspot profile add name=pay-to-connect-multi \
    hotspot-address=$routerGateway \
    dns-name=portal.local \
    html-directory=pay-to-connect \
    http-proxy=0.0.0.0:0 \
    login-by=mac,http-chap \
    use-radius=yes \
    nas-identifier=$nasId \
    radius-accounting=yes \
    radius-interim-update=3m \
    radius-location-id="Estate-WiFi-Zone-01" \
    radius-location-name="Estate WiFi Zone 01"

# Create hotspot server
/ip hotspot add name=pay-to-connect-01 \
    interface=ether2 \
    address-pool=hotspot-pool-01 \
    profile=pay-to-connect-multi \
    disabled=no

# ============================================================================
# LOAD BALANCING AND FAILOVER
# ============================================================================

# Configure multiple WAN connections if available
# Primary WAN
/ip address add address=dhcp-client interface=ether1 comment="Primary WAN"
/ip dhcp-client add interface=ether1 disabled=no comment="Primary WAN DHCP"

# Secondary WAN (if available)
# /ip address add address=dhcp-client interface=ether3 comment="Secondary WAN"
# /ip dhcp-client add interface=ether3 disabled=no comment="Secondary WAN DHCP"

# Configure routing for load balancing
/ip route add dst-address=0.0.0.0/0 gateway=ether1 routing-mark=main distance=1 comment="Primary route"

# ============================================================================
# BANDWIDTH MANAGEMENT PER ROUTER
# ============================================================================

# Set bandwidth limits per router (adjust based on your internet capacity)
:local maxDownload "50M"
:local maxUpload "25M"
:local userDownload "5M"
:local userUpload "2M"

# Create queue tree for this router
/queue tree add name=router-01-download parent=ether2 max-limit=$maxDownload
/queue tree add name=router-01-upload parent=ether2 max-limit=$maxUpload

# Default user bandwidth
/queue simple add name=default-user-01 target=$routerSubnet max-limit=($userUpload . "/" . $userDownload)

# ============================================================================
# MONITORING AND MANAGEMENT
# ============================================================================

# Configure SNMP with unique community (change for each router)
/snmp set enabled=yes community=PayToConnect-01 contact="admin@estate.local" location="Estate Router 01"

# Configure logging to central syslog server (optional)
# /system logging action add name=remote target=remote remote=YOUR_LOG_SERVER_IP
# /system logging add topics=hotspot,radius action=remote

# ============================================================================
# SYNCHRONIZATION SCRIPT
# ============================================================================

# Script to synchronize configuration across routers
/system script add name=sync-config source={
    :log info "Synchronizing router configuration..."
    
    # Add any configuration synchronization logic here
    # This could include fetching updated walled garden entries,
    # user profiles, or other settings from the central server
    
    :log info "Configuration synchronization completed"
}

# Schedule synchronization every hour
/system scheduler add name=config-sync interval=1h start-time=00:00:00 on-event=sync-config

# ============================================================================
# HEALTH CHECK SCRIPT
# ============================================================================

/system script add name=health-check source={
    :local radiusServer "YOUR_CENTRAL_RADIUS_SERVER_IP"
    :local portalServer "YOUR_PORTAL_SERVER_IP"
    
    # Check RADIUS server connectivity
    :if ([/ping $radiusServer count=3] = 0) do={
        :log error "RADIUS server unreachable"
        # Could send alert or switch to backup
    } else={
        :log info "RADIUS server connectivity OK"
    }
    
    # Check portal server connectivity
    :if ([/ping $portalServer count=3] = 0) do={
        :log error "Portal server unreachable"
    } else={
        :log info "Portal server connectivity OK"
    }
    
    # Check active hotspot sessions
    :local activeSessions [/ip hotspot active print count-only]
    :log info ("Active hotspot sessions: " . $activeSessions)
    
    # Memory and CPU check
    :local cpuLoad [/system resource get cpu-load]
    :local freeMemory [/system resource get free-memory]
    
    :if ($cpuLoad > 80) do={
        :log warning ("High CPU load: " . $cpuLoad . "%")
    }
    
    :if ($freeMemory < 10485760) do={
        :log warning ("Low memory: " . ($freeMemory / 1048576) . " MB")
    }
}

# Schedule health check every 5 minutes
/system scheduler add name=health-check interval=5m start-time=00:00:00 on-event=health-check

# ============================================================================
# ROUTER-SPECIFIC CUSTOMIZATION
# ============================================================================

# Custom variables for this specific router location
:local routerLocation "Building A - Ground Floor"
:local routerZone "Zone-01"
:local maxConcurrentUsers 50

# Set hotspot user limit
/ip hotspot profile set pay-to-connect-multi shared-users=$maxConcurrentUsers

# ============================================================================
# DEPLOYMENT CHECKLIST
# ============================================================================

# Before deploying each router, ensure:
# 1. Unique system identity
# 2. Unique NAS identifier
# 3. Unique IP subnet (no conflicts)
# 4. Correct RADIUS server IP
# 5. Proper RADIUS shared secret
# 6. Appropriate bandwidth limits
# 7. Correct interface assignments
# 8. Proper firewall rules
# 9. Unique SNMP community
# 10. Correct location information

:log info ("Multi-router setup completed for " . [/system identity get name])
:log info ("Router subnet: " . $routerSubnet)
:log info ("NAS Identifier: " . $nasId)
:log info ("Location: " . $routerLocation)
