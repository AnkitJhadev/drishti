// Loads the root-level .env (one folder above backend/).
// Imported FIRST in index.ts so all other modules see process.env populated.
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })
