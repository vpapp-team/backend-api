# backend-api

[![Greenkeeper badge](https://badges.greenkeeper.io/vpapp-team/backend-api.svg)](https://greenkeeper.io/)

# Master <-> Worker ipc communication
> ## ipc message layout:
> > | property | type | possible values | optional | description |
> > | --- | --- | --- | --- | --- |
> > | type | string | `version`, `masterRequest`, `dataChangeRequest` or `validationRequest` | `version` only when `Master->Worker`, `validationRequest` and `dataChangeRequest` only when `Master<-Worker` | type of the message |
> > | uuid | [uuid](https://github.com/vpapp-team/backend-types/blob/master/README.md#uuid) | / | only provided when `type=masterRequest` or `type=validationRequest` | uuid to match response to request |
> > | module | string | [see below](#existing%20modules) | false | the module that gets requested / responds |
> > | payload | [see below](#existing%20modules) | [see below](#existing%20modules) | only provided when `Master->Worker` | the payload itself |
> > | args | [see below](#existing%20modules) | [see below](#existing%20modules) | only provided when `Master<-Worker` | args to pass to the module |
>
> ## existing modules:
> > | name | type | payload | args | Master <- Worker | Master -> Worker | additional information |
> > | --- | --- | --- | --- | --- |
> > | `version` | `version` | [[versions](https://github.com/vpapp-team/backend-types/blob/master/README.md#version)] | / | ❌ | ✔  | get send after the worker fires the `online` event and when the versions changed |
> > | `validationRequest` | `validationRequest` | `boolean:validReqID` | `[string:proxyUUID, string:reqID]` | ✔ | ✔ | the proxy send a validation request, responds whether it was the right request |
> > | `dataChangeRequest` | `dataChangeRequest` | / | `[string:proxyUUID]` | ✔ | ❌ | someone told the proxy to broadcast a data change |
> > | `/v1.0.0/Calendar` | `masterRequest` ||| ✔ | ✔ | / |
> > | `/v1.0.0/Error` | `masterRequest` ||| ✔ | ✔ | / |
> > | `/v1.0.0/Feedback` | `masterRequest` ||| ✔ | ✔ | / |
> > | `/v1.0.0/Menu` | `masterRequest` ||| ✔ | ✔ | / |
> > | `/v1.0.0/Stand-ins` | `masterRequest` ||| ✔ | ✔ | / |
> > | `/v1.0.0/Teachers` | `masterRequest` ||| ✔ | ✔ | / |
> > | `/v1.0.0/Timetables` | `masterRequest` ||| ✔ | ✔ | / |
> > | `/v1.0.0/Updates` | `masterRequest` ||| ✔ | ✔ | / |

# Config
| property | type | default | optional | description |
| --- | --- | --- | --- |
| mysql_read | object | / | false | readonly connection to mysql db |
| mysql_read.connectionLimit | number | 10 | true | max simultaneous connections |
| mysql_read.charset | string | `UTF8MB4_GENERAL_CI` | true | charset of the connection |
| mysql_read.tables | object | `{...}` | true | table name mappings |
| mysql_read.tables.CALENDAR | string | `CalendarEvents` | true | CALENDAR mapping |
| mysql_read.tables.ERRORS | string | `Errors` | true | ERRORS mapping |
| mysql_read.tables.FEEDBACK | string | `Feedback` | true | FEEDBACK mapping |
| mysql_read.tables.UPDATES | string | `LastUpdate` | true | UPDATES mapping |
| mysql_read.tables.LESSONRANGES | string | `LessonRanges` | true | LESSONRANGES mapping |
| mysql_read.tables.MENU | string | `Menu` | true | MENU mapping |
| mysql_read.tables.STANDINS | string | `StandIn` | true | STANDINS mapping |
| mysql_read.tables.TEACHERS | string | `Teacher` | true | TEACHERS mapping |
| mysql_read.tables.TIMETABLE | string | `Timetable` | true | TIMETABLE mapping |
| mysql_read.tables.VERSIONS | string | `Versions` | true | VERSIONS mapping |
| mysql_read.tables.BACKENDS | string | `Backends` | true | BACKENDS mapping |
| mysql_read.tables.WEBADMINS | string | `WebAdmins` | true | WEBADMINS mapping |
| mysql_read.host | string | / | false | the mysql host domain/ip |
| mysql_read.user | string | / | false | mysql user name |
| mysql_read.password | string | / | false | mysql password |
| mysql_read.database | string | / | false | mysql db name |
| serverConfig | object | / | false | self information to register to proxy |
| serverConfig.host | string | / | false | own host domain/ip |
| serverConfig.port | number | / | false | own host port |
| serverConfig.method | string | / | false | method for validation requests |
| serverConfig.path | string | / | false | path for validation requests |
| serverConfig.https | boolean | / | false | whether to use https |
| serverConfig.isSameServer | boolean | / | false | whether the proxy is on the same server (localhost) |
| serverConfig.ep | [string] | / | false | list of endpoints to assign to |
| serverConfig.signature | string | / | false | signature of the serverConfig |
| proxy | [clientLocation](https://github.com/vpapp-team/backend-proxy/blob/master/README.md#clientlocation) | / | true | a proxy to register to |
| SECURE_CONTEXT | object | / | required when serverConfig.https == true | [options to pass to the https.createServer func](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener)
| ONLY_SIGNED_PROXY | boolean | true | true | whether the proxy has to have valid ssl set up |
| BACKUP_DATA_CHECK_INTERVAL | number | 1 \* 60 \* 60 \* 1000 | true | interval to check for data |
| REGISTER_INTERVAL | number | 5 \* 60 \* 1000 | true | interval to register at proxy |
