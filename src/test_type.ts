
import { BoardMember } from '@prisma/client'
import { BoardMemberWithUser } from './types'

const member: BoardMemberWithUser = {} as any;
const role = member.role;
console.log(role);
