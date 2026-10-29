import { PrismaClient, UserRole, UserStatus, FeederStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding PostgreSQL database with initial grid hierarchy and test users...');

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync('Password123!', salt);

  // 1. Zones
  const zoneDhanmondi = await prisma.zone.upsert({
    where: { code: 'DHN' },
    update: {},
    create: {
      name: 'Dhanmondi Zone',
      code: 'DHN',
      description: 'Dhanmondi & surrounding commercial/residential areas'
    }
  });

  const zoneMirpur = await prisma.zone.upsert({
    where: { code: 'MIR' },
    update: {},
    create: {
      name: 'Mirpur Zone',
      code: 'MIR',
      description: 'Mirpur metropolitan sectors 1-14'
    }
  });

  // 2. Substations
  const subDhn1 = await prisma.substation.upsert({
    where: { code: 'SUB-DHN-01' },
    update: {},
    create: {
      name: 'Dhanmondi 33/11kV Substation 1',
      code: 'SUB-DHN-01',
      zoneId: zoneDhanmondi.id,
      capacityMW: 60.0
    }
  });

  const subMir1 = await prisma.substation.upsert({
    where: { code: 'SUB-MIR-01' },
    update: {},
    create: {
      name: 'Mirpur 33/11kV Substation 1',
      code: 'SUB-MIR-01',
      zoneId: zoneMirpur.id,
      capacityMW: 80.0
    }
  });

  // 3. Feeders
  const fdr1 = await prisma.feeder.upsert({
    where: { code: 'FDR-DHN-27' },
    update: {},
    create: {
      name: 'Dhanmondi Road 27 Feeder',
      code: 'FDR-DHN-27',
      substationId: subDhn1.id,
      capacityMW: 12.5,
      isCritical: false,
      status: FeederStatus.ONLINE
    }
  });

  const fdrHosp = await prisma.feeder.upsert({
    where: { code: 'FDR-DHN-HOSP' },
    update: {},
    create: {
      name: 'Ibn Sina Hospital Critical Feeder',
      code: 'FDR-DHN-HOSP',
      substationId: subDhn1.id,
      capacityMW: 8.0,
      isCritical: true, // Hospital critical feeder: NEVER cut
      status: FeederStatus.ONLINE
    }
  });

  const fdrMir1 = await prisma.feeder.upsert({
    where: { code: 'FDR-MIR-10' },
    update: {},
    create: {
      name: 'Mirpur 10 Circle Feeder',
      code: 'FDR-MIR-10',
      substationId: subMir1.id,
      capacityMW: 20.0,
      isCritical: false,
      status: FeederStatus.ONLINE
    }
  });

  // 4. Meters
  const meter1 = await prisma.meter.upsert({
    where: { meterNumber: 'MTR-DHN-101' },
    update: {},
    create: {
      meterNumber: 'MTR-DHN-101',
      feederId: fdr1.id,
      address: 'House 14, Road 27, Dhanmondi, Dhaka'
    }
  });

  // 5. Users (All 5 Roles)
  await prisma.user.upsert({
    where: { email: 'admin@grid.gov.bd' },
    update: {},
    create: {
      name: 'System Administrator',
      email: 'admin@grid.gov.bd',
      phone: '+8801700000001',
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE
    }
  });

  await prisma.user.upsert({
    where: { email: 'operator@grid.gov.bd' },
    update: {},
    create: {
      name: 'Control Room Operator Rahim',
      email: 'operator@grid.gov.bd',
      phone: '+8801700000002',
      passwordHash,
      role: UserRole.POWER_OPERATOR,
      status: UserStatus.ACTIVE
    }
  });

  await prisma.user.upsert({
    where: { email: 'tech1@grid.gov.bd' },
    update: {},
    create: {
      name: 'Field Technician Karim',
      email: 'tech1@grid.gov.bd',
      phone: '+8801700000003',
      passwordHash,
      role: UserRole.TECHNICIAN,
      status: UserStatus.ACTIVE,
      assignedZoneId: zoneDhanmondi.id
    }
  });

  await prisma.user.upsert({
    where: { email: 'manager.dhanmondi@grid.gov.bd' },
    update: {},
    create: {
      name: 'Dhanmondi Zone Manager Tanvir',
      email: 'manager.dhanmondi@grid.gov.bd',
      phone: '+8801700000004',
      passwordHash,
      role: UserRole.ZONE_MANAGER,
      status: UserStatus.ACTIVE,
      assignedZoneId: zoneDhanmondi.id
    }
  });

  const customerUser = await prisma.user.upsert({
    where: { email: 'customer@gmail.com' },
    update: {},
    create: {
      name: 'Anisur Rahman',
      email: 'customer@gmail.com',
      phone: '+8801712345678',
      passwordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE
    }
  });

  // Link customer to meter
  await prisma.customerMeter.upsert({
    where: {
      customerId_meterId: {
        customerId: customerUser.id,
        meterId: meter1.id
      }
    },
    update: {},
    create: {
      customerId: customerUser.id,
      meterId: meter1.id,
      isPrimary: true,
      nickname: 'Residence'
    }
  });

  console.log('✅ PostgreSQL Database seeded successfully with demo grid & all 5 roles.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
