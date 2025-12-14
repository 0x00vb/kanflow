
import { BoardMember } from '@prisma/client'

const test: BoardMember = {
    id: '1',
    boardId: '1',
    userId: '1',
    role: 'MEMBER' // This should work if role exists
};

console.log(test.role);
