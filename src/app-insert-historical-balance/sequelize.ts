import { Options, Sequelize } from 'sequelize';
import pg from 'pg';

export class SequelizeChain {

    private clients: any = {};

    public client(chain_id:string) {

      if(!this.clients[chain_id]) {

        const dbCreds = JSON.parse(process.env[`DB_CREDS_${chain_id.toUpperCase()}`]as string);

        this.clients[chain_id] = new Sequelize({
            username: dbCreds.username,
            password: dbCreds.password,
            port: dbCreds.port,
            host: dbCreds.host,
            database: process.env.DB_NAME,
            dialect: 'postgres',
            protocol: 'postgres',
            define: {
                timestamps: false,
            },
            dialectOptions: {
                dialectModule: pg,
                connectTimeout: 35000,
                application_name: `blocks-inserter`,
                ssl: {
                require: true,
                rejectUnauthorized: false,
                },
            },
        });
      }
      
      return this.clients[chain_id];
    }

    public close() {
      Object.values(this.clients).map((client:any) => {
        client.close()
      })
    }
}