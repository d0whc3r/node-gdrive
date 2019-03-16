# Node gdrive

Utility to manipulate google drive using nodejs. It could upload content to google drive and it could be used as backup service.

To get `credentials.json` file you need to visit:
- [https://developers.google.com/drive/api/v3/quickstart/nodejs](https://developers.google.com/drive/api/v3/quickstart/nodejs)

Then click `ENABLE THE DRIVE API` and click `DOWNLOAD CLIENT CONFIGURATION`

By default this software check for credentials (and token) file in folder `secrets` but it could be changed using environment variables:
- **CREDENTIALS_FILE**: File with credentials (credentials.json)
- **TOKEN_FILE**: File with token, generated using credentials (token.json)

## Docker usage

You could use cli app in docker

### Build docker image

```bash
docker build -t gdrive .
```

### Run cli commands inside docker

```bash
docker run --rm -it gdrive --help
```
To make docker image work properly you need to indicate where credentials and token are located

```bash
docker run --rm -it -v $PWD/secrets:/app/secrets:ro gdrive -l
```

## Cli help output

```
Help for gdrive

  Usage of npm gdrive in command line. 

Options

  -l, --list                                     List all files and folders                                                    
  -b, --backup file*                             Backup files                                                                  
  -z, --zip zipname.zip                          Zip backup files                                                              
  -r, --replace                                  Replace files if already exists when backup upload                            
  -c, --create                                   Create destination upload folder                                              
  -f, --folder foldername                        Folder name to upload file/s                                                  
  -d, --delete foldername=duration OR duration   Clean files older than duration in foldername                                 
  -m, --mysql                                    Mysql backup using environment variables to connect mysql server              
                                                 ($MYSQL_USER, $MYSQL_PASSWORD, $MYSQL_DATABASE, $MYSQL_HOST, $MYSQL_PORT)     
  -h, --help                                     Print this usage guide.                                                       

Examples

  1. List files.                                                                      $ gdrive -l                                                   
  2. Backup multiple files to "backupFolder" folder.                                  $ gdrive -b src/index.ts -b images/logo.png -f backupFolder   
  3. Backup files using wildcard to "backup" folder.                                  $ gdrive -b src/* -b images/* -f backup                       
  4. Backup files using wildcard and zip into "zipped" folder folder will be          $ gdrive -b src/* -b images/* -z -f zipped.zip -c             
  created if it doesn't exists.                                                                                                                     
  5. Backup files using wildcard and zip using "allfiles.zip" as filename into        $ gdrive -b src/* -b images/* -z allfiles.zip -f zipped -c -r 
  "zipped" folder folder will be created if it doesn't exists and zipfile will be                                                                   
  replaced if it exists                                                                                                                             
  6. Delete files in "uploads" folder older than 2days and files in "monthly"         $ gdrive -d uploads=2d -d monthly=1M                          
  folder older than 1month                                                                                                                          
  7. Delete files in "uploads" folder older than 1minute                              $ gdrive -f uploads -d 1m                                     
  8. Generate mysql dump file zip it and upload to "mysql-backup" folder              $ gdrive -f mysql-backup -m -z   
```
