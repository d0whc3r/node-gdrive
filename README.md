# Node gdrive

Utility to manipulate google drive using nodejs. It could upload content to google drive and it could be used as backup service.

To get `credentials.json` file you need to visit:
- [https://developers.google.com/drive/api/v3/quickstart/nodejs](https://developers.google.com/drive/api/v3/quickstart/nodejs)

Then click `ENABLE THE DRIVE API` and click `DOWNLOAD CLIENT CONFIGURATION`

By default this software check for credentials (and token) file in folder `secrets` but it could be changed using environment variables:
- **CREDENTIALS_FILE**: File with credentials (credentials.json)
- **TOKEN_FILE**: File with token, generated using credentials (token.json)
