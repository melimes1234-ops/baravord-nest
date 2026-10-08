import type { Backend } from '../backend'
import { serverBackend } from './server'
import { supabaseBackend, supabaseConfig } from './supabase'

/** Supabase when a project URL + key are configured (config.js or build env), otherwise the Node server. */
export const backend: Backend = supabaseConfig() ? supabaseBackend : serverBackend
