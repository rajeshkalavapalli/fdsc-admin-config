# FDSC Admin API (fdsc-admin-config)

### V 1.0.0

- Added admin login api with secure password hashing and sessions

### V 1.0.1

- Login blocked for 15 minutes after repeated wrong attempts (per username and per network)
- Added audit log for admin actions

### V 1.0.2

- Added forgot password with mobile OTP api (SMS switched off for now)

### V 1.0.3

- Added FDSC database schema and create admin script

### V 1.0.4

- Added enquiries api with list, search, filters, summary and status / notes update

### V 1.0.5

- Added consent time column for enquiries

### V 1.0.6

- Added repeat enquiry history table and submit enquiry procedure
- Added enquiry history api for the details panel

### V 1.0.7

- Split Auth and Enquiries controllers into index (routes), handler, service, DA and sql files with try / catch in each layer
- Errors are logged once with the exact function name

### V 1.0.8

- All sql.js queries written in the same format: return block with one column per line
