import GDrive from '@/gdrive';

const gdrive = new GDrive();

async function listFiles() {
  const files = await gdrive.listFiles();
  if (files.length) {
    console.log('Files:', files);
  } else {
    console.log('No files found.');
  }
}

listFiles();

async function upload() {
  const uploaded = await gdrive.uploadFiles(['./secrets/token.json', './secrets/credentials.json'], 'files',
      { compress: 'zipped.zip', create: true, replace: true });
  console.log('uploaded', uploaded);
}

upload();
