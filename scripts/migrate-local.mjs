import {createRuntime} from './local-runtime.mjs';
const mf=await createRuntime();await mf.dispose();console.log('Local database migrations applied. npm run dev starts the app.');
