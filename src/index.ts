import Gdrive from '@/gdrive';
import { drive_v3 } from 'googleapis';
import Schema$FileList = drive_v3.Schema$FileList;

const gdrive = new Gdrive();

async function listFiles() {
  const info: Schema$FileList = await gdrive.listFiles();
  // console.log('Info', info);
  const { files } = info;
  if (files.length) {
    console.log('Files:', files.map((file) => ({ ...file, isFolder: gdrive.isFolder(file) })));
  } else {
    console.log('No files found.');
  }
}

listFiles();
