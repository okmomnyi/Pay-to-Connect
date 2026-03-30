FROM nginx:1.27-alpine
RUN apk add --no-cache certbot openssl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
COPY templates/ /etc/nginx/templates/
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
