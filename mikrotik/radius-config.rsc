# MikroTik RADIUS Configuration for Pay-to-Connect System
# Advanced RADIUS setup with accounting and session management

# ============================================================================
# RADIUS SERVER CONFIGURATION
# ============================================================================

# Primary RADIUS server configuration
/radius add service=hotspot \
    address=YOUR_RADIUS_SERVER_IP \
    secret="YOUR_RADIUS_SECRET" \
    authentication-port=1812 \
    accounting-port=1813 \
    timeout=3s \
    tries=3 \
    comment="Pay-to-Connect Primary RADIUS"

# Secondary RADIUS server (optional backup)
# /radius add service=hotspot \
#     address=YOUR_BACKUP_RADIUS_IP \
#     secret="YOUR_BACKUP_RADIUS_SECRET" \
#     authentication-port=1812 \
#     accounting-port=1813 \
#     timeout=3s \
#     tries=3 \
#     comment="Pay-to-Connect Backup RADIUS"

# ============================================================================
# HOTSPOT PROFILE WITH RADIUS
# ============================================================================

/ip hotspot profile set pay-to-connect-profile \
    use-radius=yes \
    radius-accounting=yes \
    radius-interim-update=5m \
    nas-identifier="PayToConnect-Gateway" \
    nas-port-type=wireless-802.11 \
    radius-default-domain="" \
    radius-location-id="Estate-WiFi" \
    radius-location-name="Estate WiFi Network"

# ============================================================================
# RADIUS ATTRIBUTES CONFIGURATION
# ============================================================================

# Configure RADIUS attributes for session management
# These attributes will be sent to the RADIUS server

# NAS-Identifier (already set in profile)
# NAS-IP-Address (automatically set by RouterOS)
# NAS-Port-Type (already set in profile)

# Custom attributes for enhanced tracking
/ip hotspot profile set pay-to-connect-profile \
    radius-mac-format=XX:XX:XX:XX:XX:XX

# ============================================================================
# ACCOUNTING CONFIGURATION
# ============================================================================

# Enable detailed accounting
/radius incoming set accept=yes port=3799

# Configure accounting update intervals
/ip hotspot profile set pay-to-connect-profile \
    radius-interim-update=5m

# ============================================================================
# SESSION TIMEOUT CONFIGURATION
# ============================================================================

# Configure session timeout handling
/ip hotspot profile set pay-to-connect-profile \
    session-timeout=none \
    idle-timeout=15m \
    keepalive-timeout=2m

# ============================================================================
# RADIUS TESTING
# ============================================================================

# Test RADIUS connectivity (replace with actual test credentials)
# /radius monitor 0 user=test password=test

:log info "RADIUS configuration for Pay-to-Connect completed"
