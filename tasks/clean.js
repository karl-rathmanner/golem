import del from 'del'
import args from './lib/args'

export const clean = () => {
  return del(`dist/${args.vendor}/**/*`);
};